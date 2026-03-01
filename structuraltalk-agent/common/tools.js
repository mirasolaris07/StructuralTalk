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
 */

import { config } from './config.js';

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
 * @param {number} [options.maxResults=config.SEARCH_MAX_RESULTS] - Max number of results to return
 * @param {'basic'|'advanced'} [options.searchDepth=config.TAVILY_SEARCH_DEPTH] - Search depth.
 * @param {boolean} [options.includeAnswer=true] - Whether to include summary.
 *
 * @returns {Promise<{answer: string|null, results: TavilyResult[]}>}
 */
export async function searchTavily(query, options = {}) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        throw new Error('TAVILY_API_KEY is not set.');
    }

    const {
        maxResults = config.SEARCH_MAX_RESULTS,
        searchDepth = config.TAVILY_SEARCH_DEPTH,
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
 * @param {number} [options.count=config.SEARCH_MAX_RESULTS] - Number of results to return
 * @param {string} [options.country=config.BRAVE_COUNTRY_CODE] - Country code
 *
 * @returns {Promise<{results: BraveResult[]}>}
 */
export async function searchBrave(query, options = {}) {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
        throw new Error('BRAVE_API_KEY is not set.');
    }

    const { count = config.SEARCH_MAX_RESULTS, country = config.BRAVE_COUNTRY_CODE } = options;

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
