/**
 * Type declarations for structuraltalk-agent/sequential/client.js
 * This allows TypeScript projects to import the plain-JS client module.
 */

import type { AgentThought } from '../../../src/ChatInterface';

export interface SendOptions {
    message: string;
    history?: Array<{ role: 'user' | 'agent'; content: string }>;
    mode?: 'sequential' | 'parallel';
    onThought?: (thought: AgentThought) => void;
    onResponse?: (answer: string) => void;
    onError?: (error: string) => void;
    onDone?: () => void;
}

export declare class StructuralTalkClient {
    chatUrl: string;
    constructor(serverUrl?: string, options?: { endpoint?: string });
    send(params: SendOptions): Promise<void>;
    abort(): void;
    get isStreaming(): boolean;
}
