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
import { config } from '../common/config.js';

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Run the Parallel StructuralTalk agent.
 */
export async function runAgent(userMessage, history = [], onThought) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
        model: config.MODEL_ID,
        tools: config.TOOL_DEFINITIONS,
        systemInstruction: config.SYSTEM_INSTRUCTION + "\n\nPARALLEL MODE: Analyze the query and call tools for ALL independent sub-topics AT ONCE to save time. Synthesize multiple parallel info streams into one answer.",
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

    while (depth < config.MAX_RECURSION_DEPTH) {
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
