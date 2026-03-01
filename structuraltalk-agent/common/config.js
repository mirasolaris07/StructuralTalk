/**
 * @file common/config.js
 * @description Centralized configuration for the StructuralTalk agent module.
 */

export const config = {
    // ─── Shared Parameters (Applied to both modes) ───────────────────────────
    shared: {
        /**
         * Gemini model identifier. 
         * 'gemini-2.5-flash-lite' is the recommended balance of speed and logic.
         */
        MODEL_ID: 'gemini-2.5-flash-lite',

        /**
         * Master directives for Qualification, Quantification, and Synthesis.
         */
        BASE_SYSTEM_INSTRUCTION: `You are StructuralTalk, an elite AI research assistant. 
Your unique capability is thinking through problems in a structured, recursive manner.

CORE DIRECTIVES:
1.  **Structural Breakdown**: Analyze every query and break it into logical sub-topics.
2.  **Qualification**: Every fact you provide must be qualified by its source. Mention specific research groups, organizations, and experts by name.
3.  **Quantification**: Prioritize numerical data, statistics, percentages, and dates. Avoid vague terms like "many", "fast", or "large"; use "85% of users", "3.4ms latency", or "$45B valuation".
4.  **Evidence-Based Synthesis**: Do NOT make up facts. If information is missing, state it clearly.

OUTPUT STYLE:
- Use clear headers and structured lists.
- Be precise, technical, and objective.
- Always conclude with a high-integrity synthesis of all gathered information.`,

        /**
         * Default number of results to fetch per search.
         */
        SEARCH_MAX_RESULTS: 5,

        /**
         * Search depth for Tavily ('basic' or 'advanced').
         */
        TAVILY_SEARCH_DEPTH: 'basic',

        /**
         * Country code for Brave Search results.
         */
        BRAVE_COUNTRY_CODE: 'US',

        /**
         * Tool schema sent to Gemini.
         */
        TOOL_DEFINITIONS: [
            {
                functionDeclarations: [
                    {
                        name: 'web_search',
                        description: 'Search the web for real-time information.',
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
                        description: 'Perform a deep dive into a specific sub-topic or technical detail.',
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
    },

    // ─── Sequential Mode Parameters ──────────────────────────────────────────
    sequential: {
        /**
         * Maximum number of recursive research rounds.
         */
        MAX_RECURSION_DEPTH: 6,

        /**
         * Mode-specific instruction append.
         */
        SYSTEM_INSTRUCTION_APPEND: "\n\nSEQUENTIAL MODE: Execute one search at a time. Read results carefully and decide if deeper research is needed before concluding."
    },

    // ─── Parallel Tree Mode Parameters ───────────────────────────────────────
    parallel: {
        /**
         * Maximum depth of the research tree (how many sub-branch levels).
         */
        MAX_RECURSION_DEPTH: 4,

        /**
         * Maximum rounds of research within a single branch.
         */
        BRANCH_MAX_ITERATIONS: 2,

        /**
         * Parallel-specific instruction: Orchestration behavior.
         */
        ORCHESTRATOR_INSTRUCTION: "You are the Tree Orchestrator. Break the user's question into 2-5 independent, diverse topics for research. Output ONLY a numbered list.",

        /**
         * Parallel-specific instruction: Worker behavior.
         */
        WORKER_INSTRUCTION: "\n\nPARALLEL BRANCH MODE: You are a specialist worker focusing on ONE sub-topic. Identify sub-sub-topics and investigate them recursively to build a high-rigor summary."
    }
};
