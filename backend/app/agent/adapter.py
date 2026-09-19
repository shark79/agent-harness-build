"""The AgentAdapter interface - the harness orchestrator's only view of "the
agent". Two implementations exist (see openai_agent.py / demo_agent.py);
`get_agent_adapter()` below picks one per run.

`AgentStep` is the shape that lets HarnessOrchestrator loop without knowing
which adapter it's talking to: either "call this tool with these args" or
"done, here's the final result".
"""
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.config import settings


@dataclass
class AgentStep:
    kind: Literal["tool_call", "done"]
    tool_name: str | None = None
    tool_args: dict[str, Any] = field(default_factory=dict)
    result_text: str | None = None


@dataclass
class UsageInfo:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class AgentAdapter(Protocol):
    async def run(self, task: str, context: dict) -> AgentStep: ...
    async def resume(self, run_id: str, tool_result: dict) -> AgentStep: ...
    def get_usage(self) -> UsageInfo: ...


def get_agent_adapter() -> AgentAdapter:
    """Factory: real OpenAI-backed adapter if a key is configured and demo
    mode isn't forced on, else the deterministic demo adapter.
    """
    if settings.openai_api_key and not settings.demo_mode:
        from app.agent.openai_agent import OpenAIAgentAdapter

        return OpenAIAgentAdapter()
    from app.agent.demo_agent import DemoAgentAdapter

    return DemoAgentAdapter()
