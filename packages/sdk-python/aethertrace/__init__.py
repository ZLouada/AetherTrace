"""
AetherTrace Python SDK
Zero-dependency automatic context propagation for AI agent workflows.
"""

__version__ = "0.1.0"

from contextvars import ContextVar
import functools
import uuid
from typing import Optional, Dict, Any, Callable

# Thread-safe and async-safe context storage
_trace_context: ContextVar[Dict[str, Any]] = ContextVar("aethertrace_context", default={})

def get_trace_context() -> Dict[str, Any]:
    """Returns the currently active trace context dictionary."""
    return _trace_context.get()

def get_trace_headers() -> Dict[str, str]:
    """Generates an HTTP headers dictionary containing the active trace propagation headers."""
    ctx = get_trace_context()
    if not ctx:
        return {}

    headers = {
        "X-Run-Id": ctx.get("run_id", f"run_py_{uuid.uuid4().hex[:8]}"),
        "X-Agent-Name": ctx.get("agent_name", "default-agent")
    }

    if ctx.get("run_name"):
        headers["X-Run-Name"] = ctx["run_name"]
    if ctx.get("parent_span_id"):
        headers["X-Parent-Span-Id"] = ctx["parent_span_id"]
    if ctx.get("max_budget_usd") is not None:
        headers["X-Max-Budget-USD"] = str(ctx["max_budget_usd"])
    if ctx.get("mock_upstream"):
        headers["X-Mock-Upstream"] = "true"
    if ctx.get("replay_mode"):
        headers["X-Replay-Mode"] = "true"

    return headers

class trace_run:
    """Decorator or Context Manager for wrapping an execution block in a top-level Trace Run."""

    def __init__(
        self,
        name: str = "default-run",
        run_id: Optional[str] = None,
        max_budget_usd: Optional[float] = None,
        mock_upstream: bool = False,
        replay_mode: bool = False
    ):
        self.name = name
        self.run_id = run_id or f"run_{uuid.uuid4().hex[:12]}"
        self.max_budget_usd = max_budget_usd
        self.mock_upstream = mock_upstream
        self.replay_mode = replay_mode
        self._token = None

    def __enter__(self):
        ctx = {
            "run_id": self.run_id,
            "run_name": self.name,
            "parent_span_id": None,
            "agent_name": "orchestrator",
            "max_budget_usd": self.max_budget_usd,
            "mock_upstream": self.mock_upstream,
            "replay_mode": self.replay_mode
        }
        self._token = _trace_context.set(ctx)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._token:
            _trace_context.reset(self._token)

    def __call__(self, fn: Callable):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            with self:
                return fn(*args, **kwargs)
        return wrapper

class trace_agent:
    """Decorator or Context Manager for assigning the active agent identity and parent span link."""

    def __init__(self, name: str = "default-agent", parent_span_id: Optional[str] = None):
        self.agent_name = name
        self.parent_span_id = parent_span_id
        self._token = None

    def __enter__(self):
        current = get_trace_context().copy()
        current["parent_agent_name"] = current.get("agent_name")
        current["agent_name"] = self.agent_name
        if self.parent_span_id:
            current["parent_span_id"] = self.parent_span_id
        self._token = _trace_context.set(current)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._token:
            _trace_context.reset(self._token)

    def __call__(self, fn: Callable):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            with self:
                return fn(*args, **kwargs)
        return wrapper

class trace_tool:
    """Decorator or Context Manager for tracing a tool execution."""

    def __init__(self, name: str = "default-tool", span_id: Optional[str] = None):
        self.tool_name = name
        self.span_id = span_id or f"span_tool_{uuid.uuid4().hex[:12]}"
        self._token = None

    def __enter__(self):
        current = get_trace_context().copy()
        current["parent_span_id"] = self.span_id
        current["tool_name"] = self.tool_name
        self._token = _trace_context.set(current)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._token:
            _trace_context.reset(self._token)

    def __call__(self, fn: Callable):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            with self:
                return fn(*args, **kwargs)
        return wrapper

class trace_retry:
    """Decorator or Context Manager for tracing an explicit retry attempt."""

    def __init__(self, original_span_id: str, attempt: int = 1, reason: str = "retry"):
        self.original_span_id = original_span_id
        self.attempt = attempt
        self.reason = reason
        self.retry_span_id = f"span_retry_{uuid.uuid4().hex[:12]}"
        self._token = None

    def __enter__(self):
        current = get_trace_context().copy()
        current["parent_span_id"] = self.retry_span_id
        current["retry_attempt"] = self.attempt
        current["retry_reason"] = self.reason
        self._token = _trace_context.set(current)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._token:
            _trace_context.reset(self._token)

    def __call__(self, fn: Callable):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            with self:
                return fn(*args, **kwargs)
        return wrapper

class trace_llm:
    """Decorator or Context Manager for tracing an LLM generation call."""

    def __init__(self, model: str = "gpt-4o", span_id: Optional[str] = None):
        self.model = model
        self.span_id = span_id or f"span_llm_{uuid.uuid4().hex[:12]}"
        self._token = None

    def __enter__(self):
        current = get_trace_context().copy()
        current["parent_span_id"] = self.span_id
        current["model"] = self.model
        self._token = _trace_context.set(current)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._token:
            _trace_context.reset(self._token)

    def __call__(self, fn: Callable):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            with self:
                return fn(*args, **kwargs)
        return wrapper

def emit_span(
    span_type: str,
    agent_name: Optional[str] = None,
    parent_span_id: Optional[str] = None,
    model: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cost_usd: float = 0.0,
    latency_ms: int = 0,
    request_payload: Any = None,
    response_payload: Any = None,
    proxy_base_url: str = "http://localhost:4000"
) -> Optional[Dict[str, Any]]:
    """Emits an execution span to the local AetherTrace proxy via HTTP POST."""
    import json
    import urllib.request
    import urllib.error

    ctx = get_trace_context()
    run_id = ctx.get("run_id", f"run_py_{uuid.uuid4().hex[:12]}")
    parent_id = parent_span_id if parent_span_id is not None else ctx.get("parent_span_id")
    agent = agent_name or ctx.get("agent_name", "default-agent")

    payload = {
        "run_id": run_id,
        "run_name": ctx.get("run_name"),
        "parent_span_id": parent_id,
        "span_type": span_type,
        "agent_name": agent,
        "model": model,
        "request_payload": request_payload,
        "response_payload": response_payload,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": cost_usd,
        "latency_ms": latency_ms,
        "usage_status": "reported" if (prompt_tokens or completion_tokens) else "unavailable"
    }

    try:
        url = f"{proxy_base_url.rstrip('/')}/api/spans"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status in (200, 201):
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        pass
    return None

def wrap_openai(client: Any, proxy_base_url: str = "http://localhost:4000") -> Any:
    """Wraps an OpenAI Python client instance to route through the local AetherTrace proxy."""
    base = proxy_base_url.rstrip("/")
    client.base_url = f"{base}/v1/"
    return client

class Tracer:
    run = trace_run
    agent = trace_agent
    tool = trace_tool
    llm = trace_llm
    retry = trace_retry
    emit_span = staticmethod(emit_span)
    wrap_openai = staticmethod(wrap_openai)
    get_headers = staticmethod(get_trace_headers)
    get_context = staticmethod(get_trace_context)

tracer = Tracer()

__all__ = [
    "__version__",
    "trace_run",
    "trace_agent",
    "trace_tool",
    "trace_llm",
    "trace_retry",
    "emit_span",
    "wrap_openai",
    "tracer",
    "get_trace_headers",
    "get_trace_context"
]

