"""
AetherTrace CallbackHandler for LangChain and LangGraph (Python)
Zero-dependency duck-typed callback handler for Python agent runtimes.
"""

import time
from typing import Dict, Any, List, Optional
from aethertrace import emit_span, get_trace_context

class AetherTraceCallbackHandler:
    """Duck-typed callback handler compatible with LangChain BaseCallbackHandler."""

    def __init__(self, proxy_base_url: str = "http://localhost:4000", agent_name: Optional[str] = None):
        self.proxy_base_url = proxy_base_url.rstrip("/")
        self.default_agent_name = agent_name
        self._active_calls: Dict[str, Dict[str, Any]] = {}

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        *,
        run_id: Any,
        parent_run_id: Optional[Any] = None,
        **kwargs: Any
    ) -> None:
        run_key = str(run_id)
        ctx = get_trace_context()
        self._active_calls[run_key] = {
            "span_id": f"span_py_llm_{run_key[:8]}",
            "span_type": "llm_call",
            "start_time": time.time(),
            "request_payload": {
                "prompts": prompts,
                "invocation_params": kwargs.get("invocation_params", {}),
                "model": serialized.get("name") or kwargs.get("invocation_params", {}).get("model_name")
            },
            "parent_span_id": f"span_py_chain_{str(parent_run_id)[:8]}" if parent_run_id else ctx.get("parent_span_id"),
            "agent_name": self.default_agent_name or ctx.get("agent_name", "LangChainAgent")
        }

    def on_llm_end(self, response: Any, *, run_id: Any, **kwargs: Any) -> None:
        run_key = str(run_id)
        record = self._active_calls.pop(run_key, None)
        if not record:
            return

        duration_ms = int((time.time() - record["start_time"]) * 1000)
        llm_output = getattr(response, "llm_output", {}) or {}
        token_usage = llm_output.get("token_usage", {})
        prompt_tokens = token_usage.get("prompt_tokens", 0)
        completion_tokens = token_usage.get("completion_tokens", 0)
        model = llm_output.get("model_name") or record["request_payload"].get("model") or "gpt-4o"

        emit_span(
            span_type="llm_call",
            agent_name=record["agent_name"],
            parent_span_id=record["parent_span_id"],
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            latency_ms=duration_ms,
            request_payload=record["request_payload"],
            response_payload={
                "status": "success",
                "generations": str(getattr(response, "generations", [])),
                "duration_ms": duration_ms
            },
            proxy_base_url=self.proxy_base_url
        )

    def on_llm_error(self, error: BaseException, *, run_id: Any, **kwargs: Any) -> None:
        run_key = str(run_id)
        record = self._active_calls.pop(run_key, None)
        if not record:
            return

        duration_ms = int((time.time() - record["start_time"]) * 1000)
        emit_span(
            span_type="llm_call",
            agent_name=record["agent_name"],
            parent_span_id=record["parent_span_id"],
            model=record["request_payload"].get("model"),
            latency_ms=duration_ms,
            request_payload=record["request_payload"],
            response_payload={
                "status": "error",
                "error": str(error),
                "duration_ms": duration_ms
            },
            proxy_base_url=self.proxy_base_url
        )

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        *,
        run_id: Any,
        parent_run_id: Optional[Any] = None,
        **kwargs: Any
    ) -> None:
        run_key = str(run_id)
        ctx = get_trace_context()
        tool_name = serialized.get("name", "tool")
        self._active_calls[run_key] = {
            "span_id": f"span_py_tool_{run_key[:8]}",
            "span_type": "tool_call",
            "start_time": time.time(),
            "request_payload": {"tool_name": tool_name, "input": input_str},
            "parent_span_id": f"span_py_chain_{str(parent_run_id)[:8]}" if parent_run_id else ctx.get("parent_span_id"),
            "agent_name": self.default_agent_name or ctx.get("agent_name", "LangChainAgent")
        }

    def on_tool_end(self, output: Any, *, run_id: Any, **kwargs: Any) -> None:
        run_key = str(run_id)
        record = self._active_calls.pop(run_key, None)
        if not record:
            return

        duration_ms = int((time.time() - record["start_time"]) * 1000)
        emit_span(
            span_type="tool_call",
            agent_name=record["agent_name"],
            parent_span_id=record["parent_span_id"],
            latency_ms=duration_ms,
            request_payload=record["request_payload"],
            response_payload={"status": "success", "result": str(output), "duration_ms": duration_ms},
            proxy_base_url=self.proxy_base_url
        )

    def on_tool_error(self, error: BaseException, *, run_id: Any, **kwargs: Any) -> None:
        run_key = str(run_id)
        record = self._active_calls.pop(run_key, None)
        if not record:
            return

        duration_ms = int((time.time() - record["start_time"]) * 1000)
        emit_span(
            span_type="tool_call",
            agent_name=record["agent_name"],
            parent_span_id=record["parent_span_id"],
            latency_ms=duration_ms,
            request_payload=record["request_payload"],
            response_payload={"status": "error", "error": str(error), "duration_ms": duration_ms},
            proxy_base_url=self.proxy_base_url
        )
