# StructuralTalk

> A recursive AI research agent with a real-time conversation UI — powered by **Google Gemini** and **Tavily Search**.

StructuralTalk is a full-stack chat application where the AI agent doesn't just answer questions — it **thinks out loud**. Before giving a final response, the agent:

1. **Breaks your question** into logical sub-topics
2. **Searches the web recursively** at increasing depths (L0 → L1 → L2 → L3+)
3. **Reads and synthesizes** what it finds
4. **Shows every step** live in the UI as a collapsible thought tree
5. **Delivers a final, well-researched answer**

Every reasoning step, search query, and result summary is streamed to your browser in real-time via **Server-Sent Events (SSE)** so you can follow the agent's thought process as it happens.

---

## How it looks

```
Agent Thought Process
├── L0  🧠 Analyzing your question               ✅
├── L0  🔍 Searching: "SVB collapse 2023..."     ✅
│   └── L1  📄 Found 5 results
├── L0  🧠 Analyzing search results              ✅
├── L1  🔬 Deep Research: "bond duration risk..."✅
│   └── L2  📄 Found 5 results
├── L1  🧠 Analyzing search results              ✅
├── L2  🔬 Deep Research: "regional banks 2026…" ✅
│   └── L3  📄 Found 5 results
└── L0  📄 Formulating final response            ✅

Final Answer:
SVB collapsed primarily because...
```

---

## Try these questions (they trigger deep recursion)

These questions are specifically designed to make the agent drill through **2–4 levels** of research before answering:

### 🔍 Level 2–3 Depth (moderate recursion)

> **"What are the most recent breakthroughs in room-temperature superconductors and who are the key research groups behind them?"**
>
> *Forces: initial search → discover specific papers → deep research each group's claims*

---

> **"How does Anthropic's Constitutional AI training method differ from RLHF, and what are the practical safety tradeoffs?"**
>
> *Forces: search both methods → compare findings → research safety benchmarks*

---

### 🔍🔍 Level 3–4 Depth (deep recursion)

> **"What will be the economic impact on Southeast Asia if the US-China semiconductor decoupling continues through 2027?"**
>
> *Forces: search decoupling status → search regional supply chains → search trade data per country → synthesize economic projections*

---

> **"Trace the full chain of reasons why SVB (Silicon Valley Bank) collapsed in 2023 and whether the same risks exist in regional banks today."**
>
> *Forces: search SVB timeline → research bond exposure mechanics → search current regional bank stress tests → compare conditions*

---

## Project structure

```
StructuralTalk/
├── src/                         # React frontend (Vite + TypeScript)
│   ├── App.tsx                  # Root component + header
│   ├── ChatInterface.tsx        # Chat UI, uses StructuralTalkClient
│   └── MessageNode.tsx          # Recursive thought-tree renderer
│
├── server/                      # Express backend (Node.js)
│   └── index.js                 # App bootstrap — mounts StructuralTalkServer
│
├── structuraltalk-agent/        # 📦 The reusable agent module
│   ├── index.js                 # Public API (unified)
│   ├── common/                  # Shared server, client, and tools
│   │   ├── server.js            # Unified StructuralTalkServer
│   │   ├── client.js            # Unified StructuralTalkClient
│   │   └── tools.js             # Tavily + Brave search tools
│   ├── sequential/              # Iterative deeper research mode
│   │   ├── agent.js             # Serial reasoning loop
│   │   └── index.js             
│   └── parallel/                # Fan-out / Fan-in search mode
│       ├── agent.js             # Simultaneous reasoning loop
│       └── index.js             
│
├── .env                         # API keys (never commit this)
└── package.json
```

---

## Running the app

You need **two terminals** open simultaneously:

**Terminal 1 — Frontend**
```bash
npm run dev
```
Opens the React UI at **http://localhost:5173**

**Terminal 2 — Backend Agent**
```bash
npm run server
```
Starts the Express agent API at **http://localhost:3001**

---

## Environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_google_ai_studio_key
TAVILY_API_KEY=your_tavily_key
BRAVE_API_KEY=your_brave_key        # optional, fallback search
```

| Key | Where to get it |
|-----|----------------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) |
| `TAVILY_API_KEY` | [app.tavily.com](https://app.tavily.com) |
| `BRAVE_API_KEY` | [api.search.brave.com](https://api.search.brave.com) |

---

## Using the agent in your own app

The `structuraltalk-agent/` folder is a **self-contained Node.js module**. Copy it into any Node.js project to get the same recursive research agent.

### What to copy

```
structuraltalk-agent/
├── index.js    ← import everything from here
├── common/     ← unified server/client/tools
├── sequential/ ← sequential mode brain
└── parallel/   ← parallel mode brain
```

### Install the one dependency

```bash
npm install @google/generative-ai
```

---

### Pattern 1 — Add the agent to an existing Express app

Drop-in one class, one method call:

```js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { StructuralTalkServer } from './structuraltalk-agent/index.js';

const app = express();
app.use(cors());
app.use(express.json());

// This one line registers POST /api/chat on your app
const agent = new StructuralTalkServer();
agent.mount(app);

// Mount at a custom path if needed:
// agent.mount(app, '/my-assistant/chat');

app.listen(3001, () => console.log('Agent ready at http://localhost:3001'));
```

---

### Pattern 2 — Use the agent directly in Node.js (no HTTP)

Good for CLI tools, scripts, testing, cron jobs:

```js
import 'dotenv/config';
import { runAgent } from './structuraltalk-agent/index.js';

const answer = await runAgent(
  // The question
  "Trace the full reasons why SVB collapsed and whether similar risks exist today.",

  // Conversation history (empty array = new conversation)
  [],

  // Called in real-time for every thought step
  (thought) => {
    const indent = '  '.repeat(thought.depth);
    console.log(`${indent}[L${thought.depth}][${thought.type}] ${thought.title}`);
  }
);

console.log('\n─── Final Answer ───\n');
console.log(answer);
```

**Output:**
```
[L0][reasoning] Analyzing your question
[L0][search]    Searching: "SVB Silicon Valley Bank collapse 2023 reasons"
  [L1][summary] Found 5 results
[L0][reasoning] Analyzing search results
  [L1][action]  Deep Research: "SVB bond portfolio duration risk interest rate hike"
    [L2][summary] Found 5 results
  [L1][reasoning] Analyzing search results
    [L2][action]  Deep Research: "regional bank stress tests 2025 2026"
      [L3][summary] Found 5 results
[L0][summary]   Formulating final response

─── Final Answer ───
SVB's collapse resulted from a confluence of...
```

---

### Pattern 3 — Multi-turn conversation (with history)

The agent remembers prior exchanges when you pass the history array:

```js
import 'dotenv/config';
import { runAgent } from './structuraltalk-agent/index.js';

const history = [];

async function ask(question) {
  console.log(`\n> ${question}\n`);

  const answer = await runAgent(question, history, (thought) => {
    process.stdout.write(`  [L${thought.depth}] ${thought.title}\n`);
  });

  // Append both turns to history for the next round
  history.push({ role: 'user',  content: question });
  history.push({ role: 'agent', content: answer });

  console.log('\nAnswer:', answer, '\n');
  return answer;
}

// Each follow-up question builds on the previous context
await ask("What are Constitutional AI and RLHF?");
await ask("What are the practical safety tradeoffs between them?");
await ask("What does Anthropic's latest research say about this?");
```

---

### Pattern 4 — Full stack in a new React app (SSE streaming)

**Backend** (`server.js`):
```js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { StructuralTalkServer } from './structuraltalk-agent/index.js';

const app = express();
app.use(cors());
app.use(express.json());
new StructuralTalkServer().mount(app);
app.listen(3001);
```

**Frontend** (`App.jsx`):
```jsx
import { useState, useMemo } from 'react';
import { StructuralTalkClient } from './structuraltalk-agent/client.js';

const client = new StructuralTalkClient('http://localhost:3001');

export default function App() {
  const [thoughts, setThoughts]   = useState([]);
  const [answer, setAnswer]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [question, setQuestion]   = useState('');

  const ask = async () => {
    setThoughts([]);
    setAnswer('');
    setLoading(true);

    await client.send({
      message:    question,
      history:    [],
      onThought:  (t) => setThoughts(prev => [...prev, t]),
      onResponse: (a) => setAnswer(a),
      onDone:     ()  => setLoading(false),
    });
  };

  return (
    <div>
      <input value={question} onChange={e => setQuestion(e.target.value)} />
      <button onClick={ask} disabled={loading}>Ask</button>

      {/* Render live thought tree */}
      <ul>
        {thoughts.map(t => (
          <li key={t.id} style={{ marginLeft: t.depth * 20 }}>
            [L{t.depth}] [{t.type}] {t.title}
          </li>
        ))}
      </ul>

      {answer && <p><strong>Answer:</strong> {answer}</p>}
    </div>
  );
}
```

---

## Thought event shape

Every thought emitted to your `onThought` callback:

```js
{
  id:      string   // unique: "t-1741234567-3"
  type:    'reasoning' | 'search' | 'action' | 'summary'
  title:   string   // "Searching: \"SVB collapse 2023\""
  content: string   // search snippets, context, notes
  depth:   number   // 0 = top-level, 1 = first drill-down, etc.
  status:  'running' | 'completed' | 'error'
}
```

### Depth level colour coding (in the UI)

| Badge | Colour | Meaning |
|-------|--------|---------|
| `L0` | 🟣 Purple | Initial reasoning & first searches |
| `L1` | 🔵 Blue | Results from L0 / second-round searches |
| `L2` | 🟢 Green | Deep research on L1 findings |
| `L3+` | 🟡 Orange | Maximum recursion depth |

---

## Configuration

All agent behavior is controlled via `structuraltalk-agent/common/config.js`:

```js
export const config = {
  shared: {
    MODEL_ID: 'gemini-2.5-flash-lite',
    SEARCH_MAX_RESULTS: 5,
    // Rigor directives for Qualification & Quantification...
  },
  sequential: {
    MAX_RECURSION_DEPTH: 6,
  },
  parallel: {
    MAX_RECURSION_DEPTH: 4,
    BRANCH_MAX_ITERATIONS: 2, 
  }
};
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Vanilla CSS, glassmorphism dark theme |
| Backend | Node.js, Express 5 |
| LLM | Google Gemini (via `@google/generative-ai`) |
| Primary Search | Tavily API |
| Fallback Search | Brave Search API |
| Streaming | Server-Sent Events (SSE) |

---

## TODO

- [x] **Parallel fan-out / fan-in search mode** — when Gemini requests multiple tool calls in one round, fire them simultaneously with `Promise.all()` instead of sequentially, then merge results before sending back.
- [ ] **Quantification & Qualification Framework** — Implement an automated post-research validator to ensure every final claim is backed by a specific source (qualification) and includes at least one data point (quantification).


