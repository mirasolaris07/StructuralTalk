/**
 * @file common/config.js
 * @description Centralized configuration for the StructuralTalk agent module.
 */

export const config = {
    // ─── Model & Limits ───────────────────────────────────────────────────────

    /**
     * Gemini model identifier. 
     * 'gemini-2.5-flash-lite' is the recommended balance of speed and logic.
     */
    MODEL_ID: 'gemini-2.5-flash-lite',

    /**
     * Maximum number of recursive research rounds.
     * Higher depth = more thorough but slower and more expensive.
     */
    MAX_RECURSION_DEPTH: 6,

    // ─── Search Tool Parameters ───────────────────────────────────────────────

    /**
     * Default number of results to fetch per search.
     * Higher = more context, but slower and larger prompt.
     */
    SEARCH_MAX_RESULTS: 5,

    /**
     * Search depth for Tavily ('basic' or 'advanced').
     * 'advanced' is more thorough but uses more tokens/credits.
     */
    TAVILY_SEARCH_DEPTH: 'basic',

    /**
     * Country code for Brave Search results.
     */
    BRAVE_COUNTRY_CODE: 'US',

    // ─── System Instruction (The "Brain" Directives) ───────────────────────────

    /**
     * The master system instruction that defines how the agent thinks.
     * Now updated for high-rigor Qualification and Quantification.
     */
    SYSTEM_INSTRUCTION: `You are StructuralTalk, an elite AI research assistant. 
Your unique capability is thinking through problems in a structured, recursive manner.

CORE DIRECTIVES:
1.  **Structural Breakdown**: Analyze every query and break it into logical sub-topics.
2.  **Recursive Research**: Use web_search for primary facts. Use deep_research to investigate the "Why" and "How" behind initial results.
3.  **Qualification**: Every fact you provide must be qualified by its source. Mention specific research groups, organizations, and experts by name.
4.  **Quantification**: Prioritize numerical data, statistics, percentages, and dates. Avoid vague terms like "many", "fast", or "large"; use "85% of users", "3.4ms latency", or "$45B valuation".
5.  **Evidence-Based Synthesis**: Do NOT make up facts. If information is missing, state it clearly.

OUTPUT STYLE:
- Use clear headers and structured lists.
- Be precise, technical, and objective.
- Always conclude with a high-integrity synthesis of all gathered information.`,

    // ─── Tool Definitions ────────────────────────────────────────────────────────

    /**
     * Schema sent to Gemini to define available external functions.
     */
    TOOL_DEFINITIONS: [
        {
            functionDeclarations: [
                {
                    name: 'web_search',
                    description:
                        'Search the web for real-time information. Use this for facts, news, data, and broad initial topics.',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            query: { type: 'STRING', description: 'The search query' },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'deep_research',
                    description:
                        'Perform a deep dive into a specific sub-topic or technical detail discovered earlier.',
                    parameters: {
                        type: 'OBJECT',
                        properties: {
                            query: { type: 'STRING', description: 'Focused technical query' },
                            context: { type: 'STRING', description: 'Why this deep dive is needed' },
                        },
                        required: ['query'],
                    },
                },
            ],
        },
    ],
};
