/**
 * @module structuraltalk-agent
 * @description Root entry point for the StructuralTalk sub-module.
 */

export { StructuralTalkServer } from './common/server.js';
export { StructuralTalkClient } from './common/client.js';
export { searchTavily, searchBrave } from './common/tools.js';

// Re-export both agents so they can be used explicitly
export * as sequential from './sequential/index.js';
export * as parallel from './parallel/index.js';
