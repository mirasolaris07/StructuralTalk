/**
 * Search tool implementations for the StructuralTalk agent.
 */

/**
 * Search the web using Tavily API (optimized for AI agents).
 */
export async function searchTavily(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error('TAVILY_API_KEY is not set');

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: 'basic',
            include_answer: true,
            max_results: 5,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Tavily API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
        answer: data.answer || null,
        results: (data.results || []).map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
        })),
    };
}

/**
 * Search the web using Brave Search API (fallback).
 */
export async function searchBrave(query) {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) throw new Error('BRAVE_API_KEY is not set');

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
        },
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Brave API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
        results: (data.web?.results || []).map((r) => ({
            title: r.title,
            url: r.url,
            description: r.description,
        })),
    };
}
