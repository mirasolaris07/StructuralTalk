/**
 * @file agent.js
 * @description Core recursive agent loop for StructuralTalk.
 *
 * ARCHITECTURE OVERVIEW:
 * ─────────────────────
 * This module implements a "ReAct"-style (Reason + Act) agent loop using
 * Google Gemini's native function-calling API.
 *
 * The loop works like this:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  User Question                                              │
 *   │       ↓                                                     │
 *   │  [L0] Gemini analyzes question                              │
 *   │       ↓ (requests tool call)                                │
 *   │  [L0] web_search("broad topic")     ← depth = 0            │
 *   │  [L1]   → search results returned  ← depth = 1             │
 *   │       ↓ (Gemini reads results, decides more research needed) │
 *   │  [L1] deep_research("specific sub-topic") ← depth = 1      │
 *   │  [L2]   → deeper search results       ← depth = 2          │
 *   │       ↓ (repeat up to MAX_RECURSION_DEPTH)                  │
 *   │  [Ln] Gemini produces final text answer                     │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * At every step, a "thought event" is emitted to the caller via the
 * onThought(thought) callback so the UI can show progress in real time.
 *
 * DEPTH TRACKING:
 * ───────────────
 * `depth` starts at 0 and increments after each full tool-call round.
 *   depth 0 → initial search calls
 *   depth 1 → searches triggered by Gemini after reading depth-0 results
 *   depth 2 → deep research triggered after depth-1 results
 *   ... and so on
 *
 * Search result summaries are always emitted at depth + 1 (one level
 * deeper than the search that produced them) to reflect that they are
 * sub-findings of the parent search step.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchTavily, searchBrave } from '../common/tools.js';

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Maximum number of tool-call rounds the agent will perform before
 * forcing a final answer. Prevents infinite loops on hard questions.
 * Each round is one "think → search → read" cycle.
 * Recommended range: 3–8
 */
const MAX_RECURSION_DEPTH = 6;

/**
 * Gemini model identifier.
 * Options: 'gemini-2.5-flash-lite' | 'gemini-2.0-flash' | 'gemini-1.5-pro'
 * gemini-2.5-flash-lite is fast and cost-efficient for agentic loops.
 */
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// ─── Tool Definitions ────────────────────────────────────────────────────────

/**
 * Tool schema passed to Gemini to teach it what external actions are available.
 * Gemini uses these definitions to decide when and how to call each tool.
 *
 * We expose two search tools so Gemini can differentiate:
 *   - web_search:    broad, first-pass search (used at L0)
 *   - deep_research: focused, narrow follow-up search (used at L1+)
 */
const TOOL_DEFINITIONS = [
    {
        functionDeclarations: [
            {
                name: 'web_search',
                description:
                    'Search the web for real-time, up-to-date information on any topic. ' +
                    'Use this tool when you need current data, facts, news, documentation, ' +
                    'or any information that might be beyond your training cut-off.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: {
                            type: 'STRING',
                            description: 'The search query to execute',
                        },
                    },
                    required: ['query'],
                },
            },
            {
                name: 'deep_research',
                description:
                    'Perform a deeper, more comprehensive search on a specific sub-topic. ' +
                    'Use this when you need to drill down into details after initial research ' +
                    'has revealed a sub-question that needs further investigation.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: {
                            type: 'STRING',
                            description: 'A focused, detailed search query for deep research',
                        },
                        context: {
                            type: 'STRING',
                            description: 'Brief explanation of why this deeper research is needed',
                        },
                    },
                    required: ['query'],
                },
            },
        ],
    },
];

// ─── System Prompt ───────────────────────────────────────────────────────────

/**
 * System instruction that defines how the agent behaves.
 * This is injected as a system-level context message before the conversation.
 */
const SYSTEM_INSTRUCTION = `You are StructuralTalk, an advanced AI research assistant. \
Your unique capability is thinking through problems in a structured, recursive manner.

When a user asks you a question:
1. First, analyze the query and break it into sub-topics that need investigation.
2. Use the web_search tool to find current, relevant information for each sub-topic.
3. If any search result raises deeper questions, use deep_research to investigate further.
4. After gathering enough information, synthesize everything into a clear, comprehensive answer.

IMPORTANT: Always use your tools when the question could benefit from real-time information. \
Do NOT make up facts — search for them.
When you provide your final answer, be thorough but well-organized with clear structure.`;

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Run the StructuralTalk recursive agent.
 *
 * @param {string} userMessage
 *   The current user's question or message.
 *
 * @param {Array<{role: 'user'|'agent', content: string}>} history
 *   Previous conversation turns. Pass [] for a fresh conversation.
 *   Each item is {role, content} where role is 'user' or 'agent'.
 *
 * @param {(thought: AgentThought) => void} onThought
 *   Callback fired in real-time for EVERY step the agent takes.
 *   Use this to stream progress to your UI or log it to the console.
 *   See index.js for the AgentThought type definition.
 *
 * @returns {Promise<string>} The agent's final synthesized answer.
 *
 * @throws {Error} If GEMINI_API_KEY is not set, or if Gemini API fails.
 *
 * @example
 * // Simple usage
 * const answer = await runAgent("What is quantum entanglement?", [], console.log);
 *
 * @example
 * // With conversation history
 * const history = [
 *   { role: 'user',  content: 'Tell me about TSMC.' },
 *   { role: 'agent', content: 'TSMC is a semiconductor...' },
 * ];
 * const answer = await runAgent("What about their 2nm process?", history, onThought);
 */
export async function runAgent(userMessage, history = [], onThought) {
    // ── 1. Initialize Gemini client ──────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        tools: TOOL_DEFINITIONS,
        systemInstruction: SYSTEM_INSTRUCTION,
    });

    // ── 2. Build conversation history for Gemini ─────────────────────────────
    // Gemini uses 'user' and 'model' roles (not 'agent'), so we map accordingly.
    const priorContents = history.map((msg) => ({
        role: msg.role === 'agent' ? 'model' : 'user',
        parts: [{ text: msg.content }],
    }));

    // The new user message is sent separately via chat.sendMessage()
    const currentMessageParts = [{ text: userMessage }];

    // ── 3. Helper: emit a thought event with an auto-generated ID ───────────
    let thoughtCounter = 0;
    /**
     * Emit a thought event to the caller's onThought callback.
     * Automatically assigns a unique ID to each thought.
     * @param {Omit<AgentThought, 'id'>} thought - The thought data (without id)
     */
    const emitThought = (thought) => {
        thoughtCounter++;
        onThought({
            ...thought,
            id: `t-${Date.now()}-${thoughtCounter}`,
        });
    };

    // ── 4. Emit the initial "analyzing" thought ──────────────────────────────
    emitThought({
        type: 'reasoning',
        title: 'Analyzing your question',
        content: `Processing: "${userMessage}"`,
        depth: 0,
        status: 'completed',
    });

    // ── 5. Start the chat session with prior history ─────────────────────────
    const chat = model.startChat({ contents: priorContents });

    // Send the current user message to get Gemini's first response
    let response = await chat.sendMessage(currentMessageParts);

    // ── 6. Recursive tool-call loop ──────────────────────────────────────────
    // `depth` tracks which recursion level we're currently on.
    // It increments after each complete tool-call round (think → search → result).
    let depth = 0;

    while (depth < MAX_RECURSION_DEPTH) {
        const candidate = response.response.candidates?.[0];
        if (!candidate) break; // No response from Gemini

        const parts = candidate.content?.parts || [];

        // Check whether Gemini wants to call any tools
        const functionCalls = parts.filter((p) => p.functionCall);

        if (functionCalls.length === 0) {
            // Gemini produced a text answer with no tool calls → we're done
            break;
        }

        // ── 6a. Execute each requested tool call ──────────────────────────────
        const functionResponses = [];

        for (const part of functionCalls) {
            const { name, args } = part.functionCall;
            const query = args.query;

            // Map tool name to UI type and label
            const toolType = name === 'web_search' ? 'search' : 'action';
            const title =
                name === 'web_search'
                    ? `Searching: "${query}"`
                    : `Deep Research: "${query}"`;

            // Notify caller that this search is starting (in-progress)
            emitThought({
                type: toolType,
                title,
                content: args.context || `Executing ${name}...`,
                depth, // This search started at the current recursion depth
                status: 'running',
            });

            let result;
            try {
                // Primary: Try Tavily (best for AI agents — returns clean summaries)
                result = await searchTavily(query);

                // Format top 3 results as a human-readable snippet
                const resultSummary = result.results
                    .slice(0, 3)
                    .map(
                        (r, i) =>
                            `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content?.substring(0, 150)}...`
                    )
                    .join('\n\n');

                // Emit results at depth+1 (one level deeper than the initiating search)
                emitThought({
                    type: 'summary',
                    title: `Found ${result.results.length} results`,
                    content: resultSummary || 'No results found.',
                    depth: depth + 1,
                    status: 'completed',
                });
            } catch (tavilyErr) {
                // Fallback: Try Brave Search if Tavily is unavailable
                emitThought({
                    type: 'reasoning',
                    title: 'Tavily unavailable — trying Brave Search',
                    content: tavilyErr.message,
                    depth: depth + 1,
                    status: 'completed',
                });

                try {
                    result = await searchBrave(query);

                    emitThought({
                        type: 'summary',
                        title: `Found ${result.results.length} results (Brave)`,
                        content: result.results
                            .slice(0, 3)
                            .map(
                                (r, i) =>
                                    `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description?.substring(0, 150)}...`
                            )
                            .join('\n\n'),
                        depth: depth + 1,
                        status: 'completed',
                    });
                } catch (braveErr) {
                    // Both search engines failed — tell Gemini no results were found
                    result = { results: [] };
                    emitThought({
                        type: 'reasoning',
                        title: 'All searches failed',
                        content: `Tavily: ${tavilyErr.message}\nBrave: ${braveErr.message}`,
                        depth: depth + 1,
                        status: 'error',
                    });
                }
            }

            // Package the tool result to send back to Gemini
            functionResponses.push({
                functionResponse: {
                    name,
                    response: {
                        // Send top 5 results (more context = better synthesis)
                        results: JSON.stringify(result.results?.slice(0, 5) || []),
                    },
                },
            });
        } // end for each function call

        // ── 6b. Notify caller that Gemini is processing the results ──────────
        emitThought({
            type: 'reasoning',
            title: 'Analyzing search results',
            content: 'Synthesizing information gathered from searches...',
            depth, // Same depth level as the searches that produced these results
            status: 'completed',
        });

        // ── 6c. Send all tool results back to Gemini in one batch ─────────────
        // Gemini will read the results and either:
        //   (a) call more tools (another loop iteration), or
        //   (b) produce a final text answer (exits the loop next iteration)
        response = await chat.sendMessage(functionResponses);

        // Increment depth: next round of tool calls will be one level deeper
        depth++;
    } // end while loop

    // ── 7. Extract the final text answer from Gemini's last response ─────────
    const finalParts = response.response.candidates?.[0]?.content?.parts || [];
    const finalText = finalParts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('\n');

    // Emit a closing summary thought
    emitThought({
        type: 'summary',
        title: 'Formulating final response',
        content: `Research complete after ${depth} recursive search cycle(s).`,
        depth: 0,
        status: 'completed',
    });

    return (
        finalText ||
        'I was unable to formulate a response. Please try rephrasing your question.'
    );
}
