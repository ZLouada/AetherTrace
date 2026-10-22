# Interactive Debugging Guide

AetherTrace acts as **"Burp Suite for AI Agents"**: an intercepting proxy that allows developers to pause, inspect, mutate, and mock model and tool calls mid-flight before they execute upstream.

---

## 1. Setting Live Breakpoints

Breakpoints can be set in three ways:

### 1.1. Via Flight Deck UI
1. Click **Breakpoints** in the top navigation or press <kbd>B</kbd>.
2. Enable the **Master Breakpoint Interceptor**.
3. Specify one or more target agent names (e.g. `CoderAgent`, `ResearcherAgent`).
4. Click **Update Breakpoint Rules**.

### 1.2. Via Per-Request Header
Include `X-Breakpoint: true` on any model call:
```bash
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "X-Breakpoint: true" \
  -H "X-Agent-Name: Coder" \
  ...
```

### 1.3. Via Conditional Rules
Configure structured criteria in the Breakpoint Modal:
- Field (e.g. `model`, `prompt_tokens`, `cost_usd`, `tool_name`)
- Operator (`==`, `!=`, `>`, `<`, `contains`)
- Value (e.g. `cost_usd > 0.05` or `tool_name == execute_bash`)

---

## 2. The Held Breakpoint Experience

When a call hits an active breakpoint:
1. The proxy suspends the incoming HTTP socket in memory.
2. The run enters `status: "paused"`.
3. Flight Deck displays a yellow pulsing ring around the held node.
4. The **Inspector Drawer** automatically opens showing the intercepted request.

---

## 3. Resolving Breakpoints (Human-in-the-Loop)

Developers have three choices to resolve the held execution:

### Option A: Resume (Forward)
Release the request upstream. You can edit the prompt messages or system instructions directly in the JSON editor before releasing.

### Option B: Mock Response ($0.00 Spend)
Type a synthetic text completion. The proxy returns this answer immediately to the agent client as a valid OpenAI completion. Upstream models are never called, burning **$0.00**.

### Option C: Abort
Reject the call with an HTTP 403 Forbidden, simulating a hard security denial or operator cancellation.
