# parallel/

**Status: 🚧 Not yet implemented**

This directory will contain the **Parallel Fan-out / Fan-in** implementation of the StructuralTalk agent.

See the [TODO section in the main README](../../README.md#todo) for the planned design.

## Planned difference from `sequential/`

| | `sequential/` (current) | `parallel/` (planned) |
|--|------------------------|----------------------|
| Tool execution | One search at a time | All searches fire simultaneously via `Promise.all()` |
| Gemini context | Sees each result before deciding the next search | Plans all searches upfront |
| Speed | Slower but adaptive | Faster but less flexible |
| Recursion | Iterative `while` loop | Recursive fan-out tree |
