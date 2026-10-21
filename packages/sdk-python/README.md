# AetherTrace Python SDK (`aethertrace`)

Zero-dependency automatic context propagation for Python agent frameworks (CrewAI, LangChain, AutoGen, OpenAI SDK).

## Installation

```bash
pip install aethertrace
```

## Quickstart

```python
from aethertrace import trace_run, trace_agent, get_trace_headers
from openai import OpenAI

# 1. Point standard OpenAI client to the local AetherTrace proxy
client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="sk-local-mock"  # Or your real OpenAI key
)

# 2. Automatically propagate DAG node links across nested functions
@trace_run(name="Market-Analysis-Workflow", max_budget_usd=0.05)
def execute_workflow():
    plan = run_planner()
    research = run_researcher(plan)
    return research

@trace_agent(name="Planner")
def run_planner():
    # Headers like X-Run-Id, X-Agent-Name: Planner are auto-injected
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Create a 3-step market plan"}],
        extra_headers=get_trace_headers()
    )
    return response.choices[0].message.content

@trace_agent(name="Researcher")
def run_researcher(plan: str):
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": f"Research plan: {plan}"}],
        extra_headers=get_trace_headers()
    )
    return response.choices[0].message.content

if __name__ == "__main__":
    execute_workflow()
```
