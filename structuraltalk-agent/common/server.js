/**
 * @file common/server.js
 * @description Unified Server-side class for StructuralTalk.
 * Handles both Sequential and Parallel agent modes via a 'mode' parameter.
 */

import { runAgent as runSequential } from '../sequential/agent.js';
import { runAgent as runParallel } from '../parallel/agent.js';

export class StructuralTalkServer {
    constructor(options = {}) {
        this._customOnThought = options.onThought || null;
        this._customOnError = options.onError || null;
    }

    mount(app, path = '/api/chat') {
        app.post(path, async (req, res) => {
            const { message, history, mode = 'sequential' } = req.body;

            if (!message || typeof message !== 'string') {
                return res.status(400).json({ error: '"message" (string) is required.' });
            }

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });

            const sendThought = (thought) => {
                if (this._customOnThought) {
                    this._customOnThought(thought, res);
                } else {
                    res.write(`data: ${JSON.stringify({ type: 'thought', payload: thought })}\n\n`);
                }
            };

            try {
                // Select the agent runner based on mode
                const runner = mode === 'parallel' ? runParallel : runSequential;

                const finalAnswer = await runner(
                    message,
                    history || [],
                    sendThought
                );

                res.write(`data: ${JSON.stringify({ type: 'response', payload: finalAnswer })}\n\n`);
            } catch (err) {
                console.error('[StructuralTalkServer] Agent error:', err);
                if (this._customOnError) {
                    this._customOnError(err, res);
                } else {
                    res.write(`data: ${JSON.stringify({ type: 'error', payload: err.message })}\n\n`);
                }
            } finally {
                res.write('data: [DONE]\n\n');
                res.end();
            }
        });

        console.log(`[StructuralTalkServer] Mounted at POST ${path} (Supports: sequential, parallel)`);
    }
}
