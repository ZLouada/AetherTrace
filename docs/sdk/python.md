# Python SDK Reference

The `aethertrace` package provides zero-dependency automatic context propagation using Python `contextvars` (PEP 567), compatible with async and multi-threaded frameworks like LangChain, CrewAI, and AutoGen.

---

## 1. Installation

```bash
pip install aethertrace
```

*(Or from local checkout: `pip install -e packages/sdk-python`)*

---

## 2. Core API Reference

### `trace_run`
Context manager or decorator wrapping an execution block in a top-level Trace Run.

```python
from aethertrace import trace_run

with trace_run("Security-Audit-Run", mock_upstream=False):
    # Child agents inherit this run context automatically
    run_agent_pipeline()
```

### `trace_agent`
Context manager or decorator defining the active agent identity.

```python
from aethertrace import trace_agent

with trace_agent("Planner"):
    # Generates X-Agent-Name: Planner
    call_llm("Analyze architecture")
```

### `trace_tool`
Context manager or decorator wrapping tool calls.

```python
from aethertrace import trace_tool

with trace_tool("query_database", tool_args={"table": "users"}):
    execute_sql()
```

### `get_trace_headers()`
Returns a dictionary containing the active HTTP headers for trace propagation.

```python
from aethertrace import get_trace_headers

headers = get_trace_headers()
# Pass into requests, httpx, or OpenAI client
```

---

## 3. OpenAI Python Integration Example

```python
from openai import OpenAI
from aethertrace import trace_run, trace_agent, get_trace_headers

client = OpenAI(base_url="http://localhost:4000/v1", api_key="local-dev")

with trace_run("Customer-Onboarding"):
    with trace_agent("Classifier"):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Help me setup my account"}],
            extra_headers=get_trace_headers()
        )
        print(response.choices[0].message.content)
```
