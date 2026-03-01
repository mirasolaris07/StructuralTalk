/**
 * @file server.js
 * @description Server-side class that ties together the Express SSE route
 * and the runAgent() call into a single mountable unit.
 *
 * WHAT THIS CLASS DOES:
 * ─────────────────────
 * StructuralTalkServer wraps:
 *   1. The Express POST route that accepts chat messages
 *   2. Setting the correct SSE response headers
 *   3. Calling runAgent() and forwarding each thought event to the browser
 *   4. Sending the final answer and closing the stream
 *
 * It exposes a single .mount(app) method so you can attach it to ANY
 * existing Express application in one line.
 *
 * USAGE:
 * ──────
 *   import express from 'express';
 *   import { StructuralTalkServer } from './structuraltalk-agent/index.js';
 *
 *   const app = express();
 *   app.use(express.json());
 *
 *   const stServer = new StructuralTalkServer();
 *   stServer.mount(app);        // registers POST /api/chat on your app
 *
 *   app.listen(3001);
 *
 * CUSTOMISATION:
 * ──────────────
 *   // Change the endpoint path
 *   stServer.mount(app, '/my-agent/chat');
 *
 *   // Intercept or modify thoughts before they are sent
 *   const stServer = new StructuralTalkServer({
 *     onThought: (thought, res) => {
 *       // Default behaviour: stream to browser
 *       res.write(`data: ${JSON.stringify({ type: 'thought', payload: thought })}\n\n`);
 *       // You could also log to a database here, etc.
 *     }
 *   });
 */

import { runAgent } from './agent.js';

export class StructuralTalkServer {
    /**
     * Create a new StructuralTalkServer instance.
     *
     * @param {Object} [options]
     * @param {Function} [options.onThought]
     *   Custom thought handler: (thought, res) => void
     *   If omitted, uses the default SSE streaming behaviour.
     * @param {Function} [options.onError]
     *   Custom error handler: (err, res) => void
     *   If omitted, streams the error as an SSE event.
     */
    constructor(options = {}) {
        this._customOnThought = options.onThought || null;
        this._customOnError = options.onError || null;
    }

    /**
     * Mount the chat endpoint onto an Express app.
     *
     * This registers a single POST route that:
     *   1. Reads { message, history } from the request body
     *   2. Opens an SSE stream to the browser
     *   3. Runs the recursive agent and pipes thought events to the stream
     *   4. Sends the final answer and closes the stream
     *
     * @param {import('express').Application} app - Your Express app instance
     * @param {string} [path='/api/chat'] - The URL path for the endpoint
     */
    mount(app, path = '/api/chat') {
        app.post(path, async (req, res) => {
            const { message, history } = req.body;

            // Validate input
            if (!message || typeof message !== 'string') {
                return res.status(400).json({ error: '"message" (string) is required in request body.' });
            }

            // ── Open the SSE stream ────────────────────────────────────────────
            // These headers tell the browser:
            //   - Content-Type: text/event-stream  → treat as SSE, not regular HTTP
            //   - Cache-Control: no-cache          → don't buffer / cache the stream
            //   - Connection: keep-alive           → keep the TCP connection open
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });

            // ── Define how to send a thought event to the browser ─────────────
            const sendThought = (thought) => {
                if (this._customOnThought) {
                    // User-provided custom handler
                    this._customOnThought(thought, res);
                } else {
                    // Default: write a standard SSE data line
                    // SSE format requires: "data: <json>\n\n"
                    // The double newline signals end of one event
                    res.write(
                        `data: ${JSON.stringify({ type: 'thought', payload: thought })}\n\n`
                    );
                }
            };

            // ── Run the agent ─────────────────────────────────────────────────
            try {
                const finalAnswer = await runAgent(
                    message,
                    history || [],
                    sendThought   // passed as the onThought callback
                );

                // Send the final text response as a named SSE event
                res.write(
                    `data: ${JSON.stringify({ type: 'response', payload: finalAnswer })}\n\n`
                );
            } catch (err) {
                console.error('[StructuralTalkServer] Agent error:', err);

                if (this._customOnError) {
                    this._customOnError(err, res);
                } else {
                    res.write(
                        `data: ${JSON.stringify({ type: 'error', payload: err.message })}\n\n`
                    );
                }
            } finally {
                // Send the SSE completion sentinel and close the connection
                res.write('data: [DONE]\n\n');
                res.end();
            }
        });

        console.log(`[StructuralTalkServer] Mounted at POST ${path}`);
    }
}
