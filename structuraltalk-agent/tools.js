/**
 * @file tools.js
 * @description Search tool implementations for the StructuralTalk agent.
 *
 * TOOL PRIORITY:
 * ─────────────
 *   1. Tavily Search  — Primary (purpose-built for LLM agents, returns clean
 *                       markdown-ready snippets, no HTML scraping needed)
 *   2. Brave Search   — Fallback (used if Tavily fails or is unavailable)
 *
 * WHY NOT SERP/GOOGLE DIRECTLY?
 * ─────────────────────────────
 *   Raw Google results return HTML pages that need parsing + content extraction.
 *   Tavily does this automatically and is specifically optimized for AI use cases.
 *
 * ENVIRONMENT VARIABLES:
 *   TAVILY_API_KEY  — Get at https://app.tavily.com
 *   BRAVE_API_KEY   — Get at https://api.search.brave.com
 */

// ─── Tavily Search ────────────────────────────────────────────────────────────

/**
 * Search the web using the Tavily API.
 *
 * Tavily is purpose-built for AI agents:
 * - Returns clean text content (no HTML parsing needed)
 * - Optionally provides an AI-generated answer summary
 * - Supports topic filtering ('general' | 'news')
 * - Significantly faster than scraping raw search results
 *
 * API Docs: https://docs.tavily.com/docs/rest-api/api-reference
 *
 * @param {string} query - The search query to execute
 * @param {Object} [options] - Optional search configuration
 * @param {number} [options.maxResults=5] - Max number of results to return (1-10)
 * @param {'basic'|'advanced'} [options.searchDepth='basic'] - Search depth.
 *   'advanced' returns more results but costs 2x API credits.
 * @param {boolean} [options.includeAnswer=true] - Whether to include an
 *   AI-generated answer summary alongside raw results.
 *
 * @returns {Promise<{answer: string|null, results: TavilyResult[]}>}
 *
 * @typedef {Object} TavilyResult
 * @property {string} title   - Page title
 * @property {string} url     - Source URL
 * @property {string} content - Extracted page content (clean text)
 * @property {number} score   - Relevance score (0.0–1.0)
 *
 * @throws {Error} If TAVILY_API_KEY is not set or the API returns a non-200 status.
 */
export async function searchTavily(query, options = {}) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        throw new Error(
            'TAVILY_API_KEY is not set. Add it to your .env file or process.env.'
        );
    }

    const {
        maxResults = 5,
        searchDepth = 'basic',
        includeAnswer = true,
    } = options;

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: searchDepth,
            include_answer: includeAnswer,
            max_results: maxResults,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Tavily API error (HTTP ${response.status}): ${errorText}`
        );
    }

    const data = await response.json();

    return {
        // Optional AI-generated summary from Tavily (can be null)
        answer: data.answer || null,

        // Normalize the results into a consistent shape
        results: (data.results || []).map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content,  // Clean extracted text content
            score: r.score,    // Relevance score (0.0–1.0)
        })),
    };
}

// ─── Brave Search ─────────────────────────────────────────────────────────────

/**
 * Search the web using the Brave Search API.
 *
 * Used as a fallback when Tavily is unavailable or for supplemental results.
 * Note: Brave returns descriptions only (not full page content), so results
 * are less detailed than Tavily for agent use cases.
 *
 * API Docs: https://api.search.brave.com/app/documentation/web-search/get-started
 *
 * @param {string} query - The search query to execute
 * @param {Object} [options] - Optional search configuration
 * @param {number} [options.count=5] - Number of results to return (1-20)
 * @param {string} [options.country='US'] - Country code for regional results
 *
 * @returns {Promise<{results: BraveResult[]}>}
 *
 * @typedef {Object} BraveResult
 * @property {string} title       - Page title
 * @property {string} url         - Source URL
 * @property {string} description - Short page description/snippet
 *
 * @throws {Error} If BRAVE_API_KEY is not set or the API returns a non-200 status.
 */
export async function searchBrave(query, options = {}) {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
        throw new Error(
            'BRAVE_API_KEY is not set. Add it to your .env file or process.env.'
        );
    }

    const { count = 5, country = 'US' } = options;

    // Build query string
    const params = new URLSearchParams({
        q: query,
        count: String(count),
        country: country,
    });

    const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?${params}`,
        {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': apiKey, // Brave uses this header for auth
            },
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Brave Search API error (HTTP ${response.status}): ${errorText}`
        );
    }

    const data = await response.json();

    return {
        // Normalize to a consistent shape matching Tavily's result format
        results: (data.web?.results || []).map((r) => ({
            title: r.title,
            url: r.url,
            // Brave doesn't return full content, only a short description
            description: r.description,
        })),
    };
}
