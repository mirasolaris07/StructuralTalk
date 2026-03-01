import { GoogleGenerativeAI, FunctionCallingMode } from '@google/generative-ai';
import { searchTavily, searchBrave } from './tools.js';

const MAX_RECURSION_DEPTH = 6;

/**
 * Run the recursive agent loop.
 * The agent will:
 *  1. Send the user message (+history) to Gemini with tool definitions.
 *  2. If Gemini responds with a function call, execute the tool and stream a "thought" event.
 *  3. Feed the tool result back into Gemini and repeat (up to MAX_RECURSION_DEPTH).
 *  4. When Gemini provides a final text response, return it as the answer.
 */
export async function runAgent(userMessage, history, onThought) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const tools = [
        {
            functionDeclarations: [
                {
                    name: 'web_search',
                    description:
                        'Search the web for real-time, up-to-date information on any topic. Use this tool when you need current data, facts, news, documentation, or any information that might be beyond your training cut-off.',
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
                        'Perform a deeper, more comprehensive search on a specific sub-topic. Use this when you need to drill down into details after initial research.',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            query: {
                                type: 'STRING',
                                description: 'A focused, detailed search query for deep research',
                            },
                            context: {
                                type: 'STRING',
                                description: 'Brief context about why this deep research is needed',
                            },
                        },
                        required: ['query'],
                    },
                },
            ],
        },
    ];

    const systemInstruction = `You are StructuralTalk, an advanced AI research assistant. Your unique capability is thinking through problems in a structured, recursive manner.

When a user asks you a question:
1. First, analyze the query and break it into sub-topics that need investigation.
2. Use the web_search tool to find current, relevant information for each sub-topic.
3. If any search result raises deeper questions, use deep_research to investigate further.
4. After gathering enough information, synthesize everything into a clear, comprehensive answer.

IMPORTANT: Always use your tools when the question could benefit from real-time information. Do NOT make up facts — search for them.
When you provide your final answer, be thorough but well-organized with clear structure.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        tools,
        systemInstruction,
    });

    // Build the conversation history for Gemini
    const contents = [];

    // Add prior conversation history
    for (const msg of history) {
        contents.push({
            role: msg.role === 'agent' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        });
    }

    // Add the new user message
    contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
    });

    let thoughtCounter = 0;
    const emitThought = (thought) => {
        thoughtCounter++;
        onThought({ ...thought, id: `t-${Date.now()}-${thoughtCounter}` });
    };

    // Emit the initial reasoning thought
    emitThought({
        type: 'reasoning',
        title: 'Analyzing your question',
        content: `Processing: "${userMessage}"`,
        depth: 0,
        status: 'completed',
    });

    // Recursive agent loop
    let depth = 0;
    let chat = model.startChat({ contents: contents.slice(0, -1) });

    let response = await chat.sendMessage(contents[contents.length - 1].parts);

    while (depth < MAX_RECURSION_DEPTH) {
        const candidate = response.response.candidates?.[0];
        if (!candidate) break;

        const parts = candidate.content?.parts || [];

        // Check for function calls
        const functionCalls = parts.filter((p) => p.functionCall);

        if (functionCalls.length === 0) {
            // No more tool calls — the model has produced its final text answer
            break;
        }

        // Process each function call
        const functionResponses = [];

        for (const part of functionCalls) {
            const { name, args } = part.functionCall;

            if (name === 'web_search' || name === 'deep_research') {
                const query = args.query;
                const toolType = name === 'web_search' ? 'search' : 'action';
                const title =
                    name === 'web_search'
                        ? `Searching: "${query}"`
                        : `Deep Research: "${query}"`;

                // Emit "running" thought
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

                    // Emit child thought with result summary
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
                } catch (err) {
                    // If Tavily fails, try Brave as fallback
                    emitThought({
                        type: 'reasoning',
                        title: 'Tavily unavailable, trying Brave Search',
                        content: err.message,
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
                                .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description?.substring(0, 150)}...`)
                                .join('\n\n'),
                            depth: depth + 1,
                            status: 'completed',
                        });
                    } catch (braveErr) {
                        result = { results: [], error: braveErr.message };
                        emitThought({
                            type: 'reasoning',
                            title: 'Search failed',
                            content: `Both search engines failed: ${braveErr.message}`,
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
        }

        // Feed tool results back into Gemini
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

    // Extract the final text response
    const finalParts = response.response.candidates?.[0]?.content?.parts || [];
    const finalText = finalParts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('\n');

    // Emit the final summary thought
    emitThought({
        type: 'summary',
        title: 'Formulating final response',
        content: `Compiled answer from ${depth} research cycle(s).`,
        depth: 0,
        status: 'completed',
    });

    return finalText || 'I was unable to formulate a response. Please try rephrasing your question.';
}
