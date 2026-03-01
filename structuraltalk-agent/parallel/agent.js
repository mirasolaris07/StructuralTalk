/**
 * @file agent.js (Parallel Mode)
 * @description Recursive agent loop with parallel tool-call execution.
 *
 * ARCHITECTURE OVERVIEW:
 * ─────────────────────
 * Unlike Sequential Mode, Parallel Mode launches all requested tool calls
 * in a single round simultaneously using Promise.all().
 *
 *   Round 0:  Gemini requests Search A, Search B, and Search C.
 *             ↓
 *             launch A, B, and C in parallel (non-blocking)
 *             ↓
 *             wait for all to finish (Fan-in)
 *             ↓
 *             Gemini synthesizes all results at once.
 *
 * This mode is faster for questions that require broad initial research
 * on multiple independent topics.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchTavily, searchBrave } from '../common/tools.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_RECURSION_DEPTH = 6;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
    {
        functionDeclarations: [
            {
                name: 'web_search',
                description:
                    'Search the web for real-time, up-to-date information. ' +
                    'Use this for current data, facts, news, or any info beyond your training cut-off.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: { type: 'STRING', description: 'The search query to execute' },
                    },
                    required: ['query'],
                },
            },
            {
                name: 'deep_research',
                description:
                    'Perform a deeper, more comprehensive search on a specific sub-topic. ' +
                    'Use this to drill down after initial research revealed sub-questions.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: { type: 'STRING', description: 'Focused search query' },
                        context: { type: 'STRING', description: 'Why this deeper research is needed' },
                    },
                    required: ['query'],
                },
            },
        ],
    },
];

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are StructuralTalk (Parallel Mode), an advanced research assistant. \
You research multiple topics in parallel.

When a user asks a question:
1. Analyze and break it into sub-topics.
2. Call tools for ALL sub-topics AT ONCE to save time.
3. Synthesize multiple parallel streams of information into a comprehensive answer.

IMPORTANT: Do not wait for one search to finish before starting another if they are independent. \
Provide a thorough, well-organized final response.`;

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Run the Parallel StructuralTalk agent.
 */
export async function runAgent(userMessage, history = [], onThought) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        tools: TOOL_DEFINITIONS,
        systemInstruction: SYSTEM_INSTRUCTION,
    });

    const priorContents = history.map((msg) => ({
        role: msg.role === 'agent' ? 'model' : 'user',
        parts: [{ text: msg.content }],
    }));

    const currentMessageParts = [{ text: userMessage }];

    let thoughtCounter = 0;
    const emitThought = (thought) => {
        thoughtCounter++;
        onThought({
            ...thought,
            id: `t-p-${Date.now()}-${thoughtCounter}`,
        });
    };

    emitThought({
        type: 'reasoning',
        title: 'Analyzing your question (Parallel Mode)',
        content: `Breaking down: "${userMessage}"`,
        depth: 0,
        status: 'completed',
    });

    const chat = model.startChat({ contents: priorContents });
    let response = await chat.sendMessage(currentMessageParts);

    let depth = 0;

    while (depth < MAX_RECURSION_DEPTH) {
        const candidate = response.response.candidates?.[0];
        if (!candidate) break;

        const parts = candidate.content?.parts || [];
        const functionCalls = parts.filter((p) => p.functionCall);

        if (functionCalls.length === 0) break;

        // ── 6a. Execute ALL tool calls in Parallel ─────────────────────────────

        const functionResponses = await Promise.all(
            functionCalls.map(async (part) => {
                const { name, args } = part.functionCall;
                const query = args.query;

                const toolType = name === 'web_search' ? 'search' : 'action';
                const title = name === 'web_search' ? `Searching: "${query}"` : `Deep Research: "${query}"`;

                // Notify UI that a branch has started
                emitThought({
                    type: toolType,
                    title,
                    content: args.context || `Executing parallel branch for "${name}"...`,
                    depth,
                    status: 'running',
                });

                let result;
                try {
                    // Try Tavily
                    result = await searchTavily(query);

                    const resultSummary = result.results
                        .slice(0, 3)
                        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content?.substring(0, 150)}...`)
                        .join('\n\n');

                    emitThought({
                        type: 'summary',
                        title: `Branch "${query}" found ${result.results.length} results`,
                        content: resultSummary || 'No results found.',
                        depth: depth + 1,
                        status: 'completed',
                    });
                } catch (err) {
                    // Fallback to Brave
                    try {
                        result = await searchBrave(query);
                        emitThought({
                            type: 'summary',
                            title: `Branch "${query}" found ${result.results.length} (Brave)`,
                            content: result.results.slice(0, 3).map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join('\n\n'),
                            depth: depth + 1,
                            status: 'completed',
                        });
                    } catch (err2) {
                        result = { results: [] };
                        emitThought({
                            type: 'reasoning',
                            title: `Branch "${query}" failed`,
                            content: `Errors: ${err.message}, ${err2.message}`,
                            depth: depth + 1,
                            status: 'error',
                        });
                    }
                }

                return {
                    functionResponse: {
                        name,
                        response: {
                            results: JSON.stringify(result.results?.slice(0, 5) || []),
                        },
                    },
                };
            })
        );

        emitThought({
            type: 'reasoning',
            title: 'Synthesizing parallel search branches',
            content: `Gathered results from ${functionCalls.length} simultaneous searches.`,
            depth,
            status: 'completed',
        });

        // Send results back to Gemini
        response = await chat.sendMessage(functionResponses);
        depth++;
    }

    const finalParts = response.response.candidates?.[0]?.content?.parts || [];
    const finalText = finalParts.filter((p) => p.text).map((p) => p.text).join('\n');

    emitThought({
        type: 'summary',
        title: 'Finalizing research',
        content: `Completed research using Parallel Mode across ${depth} rounds.`,
        depth: 0,
        status: 'completed',
    });

    return finalText || 'Failed to generate response in parallel mode.';
}
