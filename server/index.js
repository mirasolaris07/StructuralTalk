/**
 * @file server/index.js
 * @description Entry point for the StructuralTalk Express backend.
 *
 * This file is intentionally thin — all the chat/agent logic lives inside
 * the structuraltalk-agent module. This file just:
 *   1. Creates the Express app
 *   2. Applies middleware (CORS, JSON parsing)
 *   3. Mounts the StructuralTalkServer onto the app
 *   4. Starts listening on a port
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { StructuralTalkServer } from '../structuraltalk-agent/index.js';

// Load .env variables (GEMINI_API_KEY, TAVILY_API_KEY, etc.)
dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

// Allow requests from the Vite dev server (localhost:5173) and
// any other origin. Adjust in production to restrict to your domain.
app.use(cors());

// Parse incoming JSON request bodies (required for { message, history })
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────

// Simple endpoint to verify the server is running before sending real requests
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        model: 'gemini-2.5-flash-lite',
        keys: {
            gemini: process.env.GEMINI_API_KEY ? '✅ loaded' : '❌ missing',
            tavily: process.env.TAVILY_API_KEY ? '✅ loaded' : '❌ missing',
            brave: process.env.BRAVE_API_KEY ? '✅ loaded' : '⚠️ missing (optional)',
        },
    });
});

// ── Mount the StructuralTalk agent ────────────────────────────────────────────

// StructuralTalkServer registers POST /api/chat on the Express app.
// It handles SSE headers, runs the recursive agent, and streams thought events.
const agentServer = new StructuralTalkServer();
agentServer.mount(app); // → POST /api/chat

// ── Start listening ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`\n🧠 StructuralTalk server running at http://localhost:${PORT}`);
    console.log(`   Gemini Key: ${process.env.GEMINI_API_KEY ? '✅ loaded' : '❌ missing'}`);
    console.log(`   Tavily Key: ${process.env.TAVILY_API_KEY ? '✅ loaded' : '❌ missing'}`);
    console.log(`   Brave Key:  ${process.env.BRAVE_API_KEY ? '✅ loaded' : '⚠️  missing (optional)'}`);
    console.log(`\n   Health check: http://localhost:${PORT}/api/health\n`);
});
