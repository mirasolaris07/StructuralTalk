/**
 * @file agent.js (Parallel Mode)
 * @description Recursive Tree Agent with Parallel Fan-out / Fan-in.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchTavily, searchBrave } from '../common/tools.js';
import { config } from '../common/config.js';

// ─── Shared Thought Emitter ──────────────────────────────────────────────────

let thoughtCounter = 0;
/**
 * Emits a structured thought event to the UI.
 * Thread-safe for parallel branches within the same request.
 */
function emitThought(thought, onThought) {
    thoughtCounter++;
    onThought({
        ...thought,
        id: `t-p-${Date.now()}-${thoughtCounter}`,
    });
}

// ─── Parallel Worker: Recursive Branch Researcher ─────────────────────────────

/**
 * Investigates a specific topic recursively. 
 * Can fan out into further parallel sub-branches via tool calls.
 * 
 * @param {string} topic - The focus area for this branch.
 * @param {number} depth - How deep in the tree we are.
 * @param {function} onThought - UI streaming callback.
 * @param {GoogleGenerativeAI} genAI - API client.
 * @returns {Promise<string>} A detailed summary of findings for this branch.
 */
async function researchTopic(topic, depth, onThought, genAI) {
    if (depth >= config.parallel.MAX_RECURSION_DEPTH) {
        return `[Limit] Summary for "${topic}": MAX depth reached.`;
    }

    const branchModel = genAI.getGenerativeModel({
        model: config.shared.MODEL_ID,
        tools: config.shared.TOOL_DEFINITIONS,
        systemInstruction: config.shared.BASE_SYSTEM_INSTRUCTION + config.parallel.WORKER_INSTRUCTION
    });

    emitThought({
        type: 'reasoning',
        title: `Branch L${depth} Started`,
        content: `Investigating focus topic: "${topic}"`,
        depth,
        status: 'running'
    }, onThought);

    const chat = branchModel.startChat();
    let response = await chat.sendMessage(`Perform thorough research on: "${topic}"`);

    let branchIter = 0;
    while (branchIter < config.parallel.BRANCH_MAX_ITERATIONS) {
        const candidate = response.response.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const toolCalls = parts.filter(p => p.functionCall);

        if (toolCalls.length === 0) break;

        const toolResults = await Promise.all(
            toolCalls.map(async (call) => {
                const { name, args } = call.functionCall;
                const query = args.query;

                emitThought({
                    type: 'search',
                    title: `Branch L${depth} Search`,
                    content: `Executing: ${name}("${query}")`,
                    depth: depth,
                    status: 'running'
                }, onThought);

                let result;
                try {
                    result = await searchTavily(query);
                    const resultSnippet = result.results
                        .slice(0, 3)
                        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`)
                        .join('\n\n');

                    emitThought({
                        type: 'summary',
                        title: `Branch L${depth} Findings`,
                        content: resultSnippet || 'No results found.',
                        depth: depth + 1,
                        status: 'completed'
                    }, onThought);
                } catch (err) {
                    result = { results: [] };
                }

                return {
                    functionResponse: {
                        name,
                        response: { results: JSON.stringify(result.results?.slice(0, 5) || []) }
                    }
                };
            })
        );

        response = await chat.sendMessage(toolResults);
        branchIter++;
    }

    const finalParts = response.response.candidates?.[0]?.content?.parts || [];
    const branchSummary = finalParts.filter(p => p.text).map(p => p.text).join('\n');

    emitThought({
        type: 'summary',
        title: `Branch L${depth} Complete`,
        content: `Synthesized findings for "${topic}"`,
        depth,
        status: 'completed'
    }, onThought);

    return branchSummary;
}

// ─── Orchestrator: Main Export ───────────────────────────────────────────────

/**
 * Main entry point for Parallel Tree Mode.
 * Orchestrates initial fan-out and final synthesis.
 */
export async function runAgent(userMessage, history = [], onThought) {
    thoughtCounter = 0;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    emitThought({
        type: 'reasoning',
        title: 'Orchestrating Research Tree',
        content: `Analyzing: "${userMessage}"\nBreaking into parallel streams...`,
        depth: 0,
        status: 'running'
    }, onThought);

    const orchestratorModel = genAI.getGenerativeModel({
        model: config.shared.MODEL_ID,
        systemInstruction: config.parallel.ORCHESTRATOR_INSTRUCTION
    });

    const orchResp = await orchestratorModel.generateContent(`Break this down: "${userMessage}"`);
    const topics = orchResp.response.text().split('\n')
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 5);

    emitThought({
        type: 'reasoning',
        title: 'Fan-out Started',
        content: `Starting ${topics.length} parallel research branches:\n${topics.map(t => `• ${t}`).join('\n')}`,
        depth: 0,
        status: 'completed'
    }, onThought);

    const allFindings = await Promise.all(
        topics.map(topic => researchTopic(topic, 1, onThought, genAI))
    );

    emitThought({
        type: 'reasoning',
        title: 'Merging All Branches',
        content: `Gathered ${allFindings.length} summaries. Formulating final answer...`,
        depth: 0,
        status: 'running'
    }, onThought);

    const synthesizer = genAI.getGenerativeModel({
        model: config.shared.MODEL_ID,
        systemInstruction: config.shared.BASE_SYSTEM_INSTRUCTION + "\n\nSYNTHESIZER: Merge branch findings into one exhaustive report."
    });

    const synthesisInput = `User Prompt: ${userMessage}\n` +
        allFindings.map((f, i) => `--- BRANCH ${i + 1} SUMMARY ---\n${f}`).join('\n\n');

    const finalResult = await synthesizer.generateContent(synthesisInput);
    const finalText = finalResult.response.text();

    emitThought({
        type: 'summary',
        title: 'Final Research Complete',
        content: 'Formulated answer using Parallel Recursive Fan-out architecture.',
        depth: 0,
        status: 'completed'
    }, onThought);

    return finalText;
}
