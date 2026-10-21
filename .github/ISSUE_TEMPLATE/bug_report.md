---
name: Bug Report
about: Create a report to help us improve AetherTrace
title: '[BUG] '
labels: ['bug', 'triage']
assignees: ''
---

## Describe the Bug
A clear and concise description of what the bug is.

## Reproduction Steps
Steps to reproduce the behavior:
1. Run command '...'
2. Send request to proxy '...'
3. See error

## Expected Behavior
A clear and concise description of what you expected to happen.

## Execution Context & Trace Bundle (Recommended)
> Tip: You can export your run via `npx aethertrace export <run_id>` or the "Export .trace" button in Flight Deck UI and attach or paste the `.trace.json` here!

- **AetherTrace Version:** [e.g. 0.1.0]
- **Node.js / OS:** [e.g. Node 22 on Linux / macOS / Windows]
- **Model / Framework:** [e.g. gpt-4o, claude-3-5-sonnet, LangChain, CrewAI, AutoGen]
- **Attached `.trace.json` snippet:**

```json
{
  "version": "1.0",
  "run": { ... }
}
```

## Additional Context
Add any other context about the problem here (screenshots of Flight Deck DAG, logs from terminal, etc.).
