/**
 * @file client.js
 * @description Browser-side class that ties together the fetch call,
 * SSE stream reading, and state updates into a single reusable unit.
 *
 * WHAT THIS CLASS DOES:
 * ─────────────────────
 * StructuralTalkClient wraps:
 *   1. The fetch() call to the server's SSE endpoint
 *   2. Reading the streaming response body incrementally
 *   3. Parsing SSE data lines and dispatching to typed callbacks
 *   4. Buffering incomplete lines across stream chunks
 *
 * Instead of copying the SSE-reading boilerplate into every component,
 * you create one client instance and call .send() from anywhere.
 *
 * USAGE (plain JavaScript):
 * ──────────────────────────
 *   import { StructuralTalkClient } from './structuraltalk-agent/client.js';
 *
 *   const client = new StructuralTalkClient('http://localhost:3001');
 *
 *   await client.send({
 *     message: "What caused the 2023 banking crisis?",
 *     history: [],
 *     onThought:  (thought) => console.log(`[L${thought.depth}]`, thought.title),
 *     onResponse: (answer)  => console.log('Answer:', answer),
 *     onError:    (err)     => console.error('Error:', err),
 *   });
 *
 * USAGE (React hook — drop-in replacement for ChatInterface.tsx logic):
 * ──────────────────────────────────────────────────────────────────────
 *   const client = useMemo(() => new StructuralTalkClient(API_URL), []);
 *
 *   const handleSend = async () => {
 *     await client.send({
 *       message: inputValue,
 *       history: messages.map(m => ({ role: m.role, content: m.content })),
 *       onThought:  (t) => setLiveThoughts(prev => [...prev, t]),
 *       onResponse: (a) => setMessages(prev => [...prev, { role:'agent', content: a }]),
 *     });
 *   };
 *
 * NOTE: This module uses the browser Fetch API and is intended for
 * client-side use only (React, plain JS in <script> tags, etc).
 * Do NOT import this in Node.js server code.
 */

export class StructuralTalkClient {
    /**
     * Create a new StructuralTalkClient.
     *
     * @param {string} [serverUrl='http://localhost:3001']
     *   Base URL of the StructuralTalk backend server.
     * @param {Object} [options]
     * @param {string} [options.endpoint='/api/chat']
     *   The chat endpoint path. Must match what StructuralTalkServer mounted.
     */
    constructor(serverUrl = 'http://localhost:3001', options = {}) {
        /** @type {string} Full URL of the SSE chat endpoint */
        this.chatUrl = `${serverUrl}${options.endpoint || '/api/chat'}`;

        /** @type {AbortController|null} Used to cancel an in-progress request */
        this._abortController = null;
    }

    /**
     * Send a message to the agent and stream the response.
     *
     * Opens an SSE connection to the server, runs the recursive agent,
     * and calls your callbacks for each event as they arrive.
     *
     * @param {Object} params
     * @param {string} params.message
     *   The user's question or message.
     * @param {Array<{role: 'user'|'agent', content: string}>} [params.history=[]]
     *   Prior conversation turns. Pass [] for a brand new conversation.
     * @param {(thought: AgentThought) => void} [params.onThought]
     *   Called in real-time for every thought step the agent emits.
     *   Use this to update your UI as the agent thinks.
     * @param {(answer: string) => void} [params.onResponse]
     *   Called once with the agent's complete final answer.
     * @param {(error: string) => void} [params.onError]
     *   Called if the agent or network encounters an error.
     * @param {() => void} [params.onDone]
     *   Called when the stream closes, regardless of success or failure.
     *   Good for resetting loading states.
     *
     * @returns {Promise<void>} Resolves when the stream has fully closed.
     *
     * @throws {Error} If the server is unreachable (network error).
     */
    async send({ message, history = [], onThought, onResponse, onError, onDone }) {
        // Cancel any existing in-flight request before starting a new one
        this.abort();
        this._abortController = new AbortController();

        try {
            // ── 1. Open the SSE fetch request ──────────────────────────────────
            const response = await fetch(this.chatUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, history }),
                signal: this._abortController.signal,
            });

            if (!response.ok || !response.body) {
                const errText = await response.text().catch(() => response.statusText);
                throw new Error(`Server error (${response.status}): ${errText}`);
            }

            // ── 2. Set up the stream reader ────────────────────────────────────
            // The browser's Fetch API gives us a ReadableStream for SSE.
            // We read it chunk by chunk using a reader.
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // Buffer holds incomplete SSE lines between chunks.
            // A chunk from the network might end mid-line, so we
            // carry incomplete data forward until we see a newline.
            let buffer = '';

            // ── 3. Read the stream loop ────────────────────────────────────────
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;  // Server closed the connection

                // Decode the binary chunk to text and append to buffer
                buffer += decoder.decode(value, { stream: true });

                // Split on newlines — SSE events end with "\n\n"
                const lines = buffer.split('\n');

                // The last element may be incomplete — keep it in the buffer
                buffer = lines.pop() || '';

                // ── 4. Process each complete SSE line ──────────────────────────
                for (const line of lines) {
                    // SSE data lines always start with "data: "
                    // Skip blank lines, comment lines, and event/id lines
                    if (!line.startsWith('data: ')) continue;

                    const data = line.slice(6).trim(); // Remove "data: " prefix

                    // The server sends "[DONE]" as the final sentinel
                    if (data === '[DONE]') continue;

                    // ── 5. Parse and dispatch the event ─────────────────────────
                    let event;
                    try {
                        event = JSON.parse(data);
                    } catch {
                        // Skip malformed JSON (shouldn't happen in normal operation)
                        console.warn('[StructuralTalkClient] Failed to parse SSE line:', data);
                        continue;
                    }

                    // Route the event to the appropriate callback
                    switch (event.type) {
                        case 'thought':
                            // A thought step from the agent (reasoning/search/summary)
                            onThought?.(event.payload);
                            break;

                        case 'response':
                            // The agent's final synthesized answer
                            onResponse?.(event.payload);
                            break;

                        case 'error':
                            // An error occurred on the server side
                            onError?.(event.payload);
                            break;

                        default:
                            // Unknown event type — ignore gracefully
                            break;
                    }
                }
            }
        } catch (err) {
            // Don't report AbortError — that's intentional cancellation
            if (err.name !== 'AbortError') {
                onError?.(err.message || String(err));
            }
        } finally {
            this._abortController = null;
            // Always notify caller that the stream has ended
            onDone?.();
        }
    }

    /**
     * Cancel the currently in-progress agent request.
     * Safe to call even if no request is active.
     *
     * @returns {void}
     */
    abort() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
    }

    /**
     * Check if an agent request is currently in progress.
     *
     * @returns {boolean} True if a request is active.
     */
    get isStreaming() {
        return this._abortController !== null;
    }
}
