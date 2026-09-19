"""DemoAgentAdapter - the harness's own deterministic, offline implementation
of the AgentAdapter interface. It is NOT a fabricated OpenAI API and does not
call any external service; it simulates the same reasoning *shape* a real
LLM-backed agent would produce (plan -> request tool -> react to result ->
finish) using simple, documented keyword rules on the task text. It exists so
this hackathon demo works end-to-end with zero external credentials and is
fully offline-reliable. Swap in OpenAIAgentAdapter (openai_agent.py) once a
real OPENAI_API_KEY is set and DEMO_MODE is not "true" - see adapter.py's
get_agent_adapter() factory.

Planning rules (see _build_plan):
  - task mentions "email"                     -> web_search -> compose summary -> send_email -> done
  - task is arithmetic / mentions "calculate"  -> calculator -> done
  - task mentions "research" (no "email")      -> web_search -> done
  - anything else                              -> short canned completion, no tools
If a tool request comes back denied (permission DENY or approval denied), the
adapter finishes gracefully instead of re-requesting the same tool - it never
loops on a denied tool.
"""
import re
from dataclasses import dataclass, field
from typing import Any

from app.agent.adapter import AgentStep, UsageInfo

_ARITH_TOKEN_RE = re.compile(r"[-+*/().\d\s]+")


def _looks_like_arithmetic(task: str) -> bool:
    stripped = task.strip()
    return bool(stripped) and bool(re.fullmatch(r"[-+*/().\d\s]+", stripped))


def _extract_expression(task: str) -> str:
    """Best-effort pull of the arithmetic substring out of a task string,
    e.g. "please calculate 12 * (3 + 4) thanks" -> "12 * (3 + 4)".
    """
    candidates = [m.strip() for m in _ARITH_TOKEN_RE.findall(task) if any(ch.isdigit() for ch in m)]
    return max(candidates, key=len) if candidates else task.strip()


@dataclass
class DemoAgentAdapter:
    model_name: str = "demo-agent"
    _task: str = ""
    _plan: list[str] = field(default_factory=list)
    _index: int = 0
    _search_result: dict[str, Any] | None = None
    _calc_result: dict[str, Any] | None = None
    _usage: UsageInfo = field(default_factory=UsageInfo)

    async def run(self, task: str, context: dict) -> AgentStep:
        self._task = task
        self._plan = self._build_plan(task)
        self._usage = self._estimate_usage(task)
        return self._next_step()

    async def resume(self, run_id: str, tool_result: dict) -> AgentStep:
        if tool_result.get("error") == "denied":
            return AgentStep(kind="done", result_text=self._final_text(email_denied=True))
        last_action = self._plan[self._index - 1]
        if last_action == "web_search":
            self._search_result = tool_result
        elif last_action == "calculator":
            self._calc_result = tool_result
        return self._next_step()

    def get_usage(self) -> UsageInfo:
        return self._usage

    # -- planning -----------------------------------------------------------

    def _build_plan(self, task: str) -> list[str]:
        lowered = task.lower()
        if "email" in lowered:
            return ["web_search", "send_email"]
        if "calculate" in lowered or _looks_like_arithmetic(task):
            return ["calculator"]
        if "research" in lowered:
            return ["web_search"]
        return []

    def _next_step(self) -> AgentStep:
        if self._index >= len(self._plan):
            return AgentStep(kind="done", result_text=self._final_text())
        action = self._plan[self._index]
        self._index += 1
        if action == "web_search":
            return AgentStep(kind="tool_call", tool_name="web_search", tool_args={"query": self._task})
        if action == "calculator":
            return AgentStep(
                kind="tool_call", tool_name="calculator", tool_args={"expression": _extract_expression(self._task)}
            )
        if action == "send_email":
            return AgentStep(
                kind="tool_call",
                tool_name="send_email",
                tool_args={
                    "to": "demo-user@example.com",
                    "subject": f"Summary: {self._task[:60]}",
                    "body": self._compose_summary(),
                },
            )
        raise ValueError(f"unknown planned action: {action}")  # pragma: no cover - defensive

    def _compose_summary(self) -> str:
        if not self._search_result or not self._search_result.get("results"):
            return f"Executive summary for: {self._task}"
        bullets = "\n".join(f"- {r['title']}: {r['snippet']}" for r in self._search_result["results"])
        return f"Executive summary for '{self._task}':\n{bullets}"

    def _final_text(self, email_denied: bool = False) -> str:
        if email_denied:
            return self._compose_summary() + "\n\n(Email delivery was denied by policy; report delivered here instead, not sent.)"
        if "send_email" in self._plan:
            return f"{self._compose_summary()}\n\nEmail sent."
        if "calculator" in self._plan and self._calc_result:
            return f"Result: {self._calc_result['result']}"
        if "web_search" in self._plan and self._search_result:
            return self._compose_summary()
        return f"Completed task: {self._task}"

    def _estimate_usage(self, task: str) -> UsageInfo:
        # Small plausible fake token count, proportional to task length, so
        # downstream budget/metrics code (next phase) has real numbers to
        # work with even though no real model call happened.
        prompt_tokens = max(20, len(task.split()) * 4)
        completion_tokens = max(15, prompt_tokens // 2)
        return UsageInfo(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        )
