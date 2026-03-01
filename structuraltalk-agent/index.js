/**
 * @module structuraltalk-agent
 *
 * StructuralTalk Agent — Public API
 * ==================================
 * A self-contained Node.js (ESM) module providing a recursive AI research
 * agent with real-time SSE streaming of thought steps.
 *
 * FILES IN THIS PACKAGE:
 * ─────────────────────
 *   index.js   ← This file. Import everything from here.
 *   agent.js   ← Core recursive Gemini loop (the brain)
 *   tools.js   ← Tavily + Brave search implementations
 *   server.js  ← StructuralTalkServer: mounts SSE route on Express
 *   client.js  ← StructuralTalkClient: reads SSE stream in the browser
 *
 * ENVIRONMENT VARIABLES:
 * ──────────────────────
 *   GEMINI_API_KEY  — Google AI Studio  (aistudio.google.com)
 *   TAVILY_API_KEY  — Tavily            (app.tavily.com)
 *   BRAVE_API_KEY   — Brave Search      (api.search.brave.com) [optional]
 *
 * ══════════════════════════════════════════════════════════════════════════
 * QUICK-START: Full stack in ~10 lines
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SERVER (Node.js / Express):
 * ───────────────────────────
 *   import express from 'express';
 *   import cors from 'cors';
 *   import { StructuralTalkServer } from './structuraltalk-agent/index.js';
 *
 *   const app = express();
 *   app.use(cors());
 *   app.use(express.json());
 *
 *   const agent = new StructuralTalkServer();
 *   agent.mount(app);   // registers POST /api/chat
 *
 *   app.listen(3001, () => console.log('Server running'));
 *
 * CLIENT (Browser / React):
 * ─────────────────────────
 *   import { StructuralTalkClient } from './structuraltalk-agent/client.js';
 *
 *   const client = new StructuralTalkClient('http://localhost:3001');
 *
 *   await client.send({
 *     message:    "What caused SVB to collapse?",
 *     history:    [],
 *     onThought:  (t) => console.log(`[L${t.depth}] ${t.title}`),
 *     onResponse: (a) => console.log('Answer:', a),
 *   });
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LOWER-LEVEL USAGE: runAgent() directly (no HTTP)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   import { runAgent } from './structuraltalk-agent/index.js';
 *
 *   const answer = await runAgent(
 *     "What is quantum entanglement?",
 *     [],
 *     (thought) => console.log(thought)
 *   );
 *
 */

// ── Server-side exports ───────────────────────────────────────────────────────

/**
 * StructuralTalkServer — mountable Express class.
 * Registers the POST /api/chat SSE endpoint.
 * Import this in your Node.js server code only.
 */
export { StructuralTalkServer } from './server.js';

/**
 * runAgent — the raw recursive agent function.
 * Use this if you don't need HTTP/SSE and want to call the agent directly
 * from Node.js code (e.g. a CLI script, a cron job, a test).
 */
export { runAgent } from './agent.js';

/**
 * Search tools — exposed for direct use if needed.
 * For example, use searchTavily() independently in your own code.
 */
export { searchTavily, searchBrave } from './tools.js';

// ── Client-side exports ───────────────────────────────────────────────────────

/**
 * StructuralTalkClient — browser SSE consumer class.
 * Import this in your frontend / React code only.
 * Do NOT import in Node.js server code (uses browser Fetch API).
 *
 * Import directly from client.js to keep server/client bundles separate:
 *   import { StructuralTalkClient } from './structuraltalk-agent/client.js';
 *
 * Or import from index.js if your bundler handles tree-shaking:
 */
export { StructuralTalkClient } from './client.js';
