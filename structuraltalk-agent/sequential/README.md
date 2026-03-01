# structuraltalk-agent

A self-contained **Node.js (ESM)** module that runs a recursive AI research agent.

It uses **Google Gemini** to reason through questions, calling **Tavily Search** (with **Brave** as fallback) recursively until it has enough information to give a comprehensive answer. Every step emits a "thought event" so you can display the agent's reasoning process in real-time.

---

## What's in the package?

```
structuraltalk-agent/
├── index.js      ← Entry point — import from here
├── agent.js      ← Recursive Gemini loop (the brain)
├── tools.js      ← Tavily + Brave search implementations
├── package.json  ← Module metadata
└── README.md     ← This file
```

> **Take these 3 files with you:** `index.js`, `agent.js`, `tools.js`

---

## Language & Runtime

| Question | Answer |
|----------|--------|
| Language | **JavaScript (ESM)** — `"type": "module"` |
| Runtime  | **Node.js** v18+ |
| Python?  | ❌ No — this is a Node.js package |
| Browser? | ❌ No — requires server-side env vars and Node fetch |

---

## Requirements

```bash
npm install @google/generative-ai dotenv
```

And a `.env` file (or set these in `process.env`):

```env
GEMINI_API_KEY=your_google_ai_studio_key
TAVILY_API_KEY=your_tavily_key
BRAVE_API_KEY=your_brave_key     # optional, used as fallback
```

---

## Usage

### Simplest possible usage

```js
import 'dotenv/config';
import { runAgent } from './structuraltalk-agent/index.js';

const answer = await runAgent(
  "What caused Silicon Valley Bank to collapse in 2023?",
  [],              // empty history for a new conversation
  (thought) => {   // called in real-time for every reasoning step
    console.log(`[L${thought.depth}] [${thought.type}] ${thought.title}`);
  }
);

console.log('\nFinal Answer:\n', answer);
```

**Terminal output:**
```
[L0] [reasoning] Analyzing your question
[L0] [search]    Searching: "Silicon Valley Bank collapse 2023 causes"
[L1] [summary]   Found 5 results
[L0] [reasoning] Analyzing search results
[L1] [action]    Deep Research: "SVB bond portfolio duration risk interest rates"
[L2] [summary]   Found 5 results
[L1] [reasoning] Analyzing search results
[L0] [summary]   Formulating final response

Final Answer:
SVB collapsed primarily due to...
```

---

### With conversation history

```js
import 'dotenv/config';
import { runAgent } from './structuraltalk-agent/index.js';

// Keep track of the conversation
const history = [];

async function chat(userMessage) {
  const thoughts = [];

  const answer = await runAgent(
    userMessage,
    history,
    (thought) => thoughts.push(thought)
  );

  // Add both turns to history for the next round
  history.push({ role: 'user',  content: userMessage });
  history.push({ role: 'agent', content: answer });

  return { answer, thoughts };
}

// Round 1
const r1 = await chat("Tell me about TSMC's manufacturing capabilities.");
console.log(r1.answer);

// Round 2 — the agent remembers round 1
const r2 = await chat("How does that compare to Samsung?");
console.log(r2.answer);
```

---

### Streaming over HTTP with Server-Sent Events (SSE)

This is how the StructuralTalk UI uses the agent:

```js
import express from 'express';
import { runAgent } from './structuraltalk-agent/index.js';

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  // SSE headers
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  // Stream each thought as it happens
  const answer = await runAgent(message, history || [], (thought) => {
    res.write(`data: ${JSON.stringify({ type: 'thought', payload: thought })}\n\n`);
  });

  // Send the final answer
  res.write(`data: ${JSON.stringify({ type: 'response', payload: answer })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(3001);
```

---

## Thought Event Shape

Every call to your `onThought` callback receives an object with this shape:

```ts
{
  id:      string   // unique ID, e.g. "t-1741234567-3"
  type:    'reasoning' | 'search' | 'action' | 'summary'
  title:   string   // short label, e.g. 'Searching: "TSMC 2nm process"'
  content: string   // details, search snippets, or context text
  depth:   number   // recursion level — 0 = top-level, 1 = first drill-down...
  status:  'running' | 'completed' | 'error'
}
```

### Depth levels explained

| Depth | Color in UI | Meaning |
|-------|-------------|---------|
| L0    | 🟣 Purple   | First-pass reasoning and searches |
| L1    | 🔵 Blue     | Results from L0 / second-round searches |
| L2    | 🟢 Green    | Deep research on L1 findings |
| L3+   | 🟡 Orange   | Further recursive investigation |

---

## API Reference

### `runAgent(userMessage, history, onThought) → Promise<string>`

| Parameter | Type | Description |
|-----------|------|-------------|
| `userMessage` | `string` | The user's question |
| `history` | `Array<{role, content}>` | Prior conversation turns (`[]` for new) |
| `onThought` | `(thought) => void` | Called live for every reasoning step |

**Returns:** `Promise<string>` — the agent's final synthesized answer.

### `searchTavily(query, options?) → Promise<{answer, results}>`

Direct access to Tavily search. See `tools.js` for full JSDoc.

### `searchBrave(query, options?) → Promise<{results}>`

Direct access to Brave search. See `tools.js` for full JSDoc.

---

## Configuration

Edit these constants at the top of `agent.js`:

```js
const MAX_RECURSION_DEPTH = 6;  // max search rounds (3-8 recommended)
const GEMINI_MODEL = 'gemini-2.5-flash-lite'; // model to use
```
