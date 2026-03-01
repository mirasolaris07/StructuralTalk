/**
 * @file agent.js
 * @description Core recursive agent loop for StructuralTalk.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchTavily, searchBrave } from '../common/tools.js';
import { config } from '../common/config.js';

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Run the StructuralTalk recursive agent.
 *
 * @param {string} userMessage - The user's question.
 * @param {Array} history - Previous conversation turns.
 * @param {function} onThought - Thought streaming callback.
 * @returns {Promise<string>} The agent's final synthesized answer.
 */
export async function runAgent(userMessage, history = [], onThought) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
        model: config.shared.MODEL_ID,
        tools: config.shared.TOOL_DEFINITIONS,
        systemInstruction: config.shared.BASE_SYSTEM_INSTRUCTION + config.sequential.SYSTEM_INSTRUCTION_APPEND,
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
            id: `t-${Date.now()}-${thoughtCounter}`,
        });
    };

    emitThought({
        type: 'reasoning',
        title: 'Analyzing your question',
        content: `Processing: "${userMessage}"`,
        depth: 0,
        status: 'completed',
    });

    const chat = model.startChat({ contents: priorContents });
    let response = await chat.sendMessage(currentMessageParts);

    let depth = 0;
    while (depth < config.sequential.MAX_RECURSION_DEPTH) {
        const candidate = response.response.candidates?.[0];
        if (!candidate) break;

        const parts = candidate.content?.parts || [];
        const functionCalls = parts.filter((p) => p.functionCall);

        if (functionCalls.length === 0) break;

        const functionResponses = [];
        for (const part of functionCalls) {
            const { name, args } = part.functionCall;
            const query = args.query;

            const toolType = name === 'web_search' ? 'search' : 'action';
            const title = name === 'web_search' ? `Searching: "${query}"` : `Deep Research: "${query}"`;

            emitThought({
                type: toolType,
                title,
                content: args.context || `Executing ${name}...`,
                depth,
                status: 'running',
            });

            let result;
            try {
                result = await searchTavily(query);
                const resultSummary = result.results
                    .slice(0, 3)
                    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content?.substring(0, 150)}...`)
                    .join('\n\n');

                emitThought({
                    type: 'summary',
                    title: `Found ${result.results.length} results`,
                    content: resultSummary || 'No results found.',
                    depth: depth + 1,
                    status: 'completed',
                });
            } catch (tavilyErr) {
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
                        content: result.results.slice(0, 3).map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join('\n\n'),
                        depth: depth + 1,
                        status: 'completed',
                    });
                } catch (braveErr) {
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

            functionResponses.push({
                functionResponse: {
                    name,
                    response: {
                        results: JSON.stringify(result.results?.slice(0, 5) || []),
                    },
                },
            });
        }

        emitThought({
            type: 'reasoning',
            title: 'Analyzing search results',
            content: 'Synthesizing information gathered from searches...',
            depth,
            status: 'completed',
        });

        response = await chat.sendMessage(functionResponses);
        depth++;
    }

    const finalParts = response.response.candidates?.[0]?.content?.parts || [];
    const finalText = finalParts.filter((p) => p.text).map((p) => p.text).join('\n');

    emitThought({
        type: 'summary',
        title: 'Formulating final response',
        content: `Research complete after ${depth} recursive search cycle(s).`,
        depth: 0,
        status: 'completed',
    });

    return finalText || 'Failed to generate response.';
}
