"""Real, OpenAI-backed AgentAdapter. Used when OPENAI_API_KEY is set and
DEMO_MODE is not "true" (see adapter.py's get_agent_adapter() factory).

Uses the standard `openai` Python SDK's `chat.completions.create(...,
tools=[...], tool_choice="auto")` function-calling loop - not the separate
`openai-agents` package (not installed/pinned for this project). Reads
PRIMARY_MODEL from env; never hardcodes a model name.
"""
import json

from openai import AsyncOpenAI

from app.agent.adapter import AgentStep, UsageInfo
from app.agent.prompts import SYSTEM_PROMPT
from app.config import settings
from app.tools.registry import Permission, tool_registry

# JSON-schema parameters for each ALLOW-or-approval tool. delete_record (DENY)
# is deliberately excluded - the model is never even offered it as a tool.
_TOOL_PARAMETERS = {
    "web_search": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "Search query"}},
        "required": ["query"],
    },
    "calculator": {
        "type": "object",
        "properties": {"expression": {"type": "string", "description": "Arithmetic expression, e.g. 12 * (3 + 4)"}},
        "required": ["expression"],
    },
    "send_email": {
        "type": "object",
        "properties": {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
        },
        "required": ["to", "subject", "body"],
    },
}


def _build_tool_schemas() -> list[dict]:
    schemas = []
    for meta in tool_registry.all():
        if meta.permission == Permission.DENY:
            continue
        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": meta.name,
                    "description": meta.description,
                    "parameters": _TOOL_PARAMETERS.get(meta.name, {"type": "object", "properties": {}}),
                },
            }
        )
    return schemas


class OpenAIAgentAdapter:
    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model_name = settings.primary_model
        # fallback_model is read (never hardcoded) so future retry/routing
        # logic (routing.py, next dispatch) can switch to it without this
        # adapter needing to change.
        self.fallback_model_name = settings.fallback_model
        self._messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
        self._pending_tool_call_id: str | None = None
        self._usage = UsageInfo()
        self._tools = _build_tool_schemas()

    async def run(self, task: str, context: dict) -> AgentStep:
        self._messages.append({"role": "user", "content": task})
        return await self._call_model()

    async def resume(self, run_id: str, tool_result: dict) -> AgentStep:
        self._messages.append(
            {
                "role": "tool",
                "tool_call_id": self._pending_tool_call_id,
                "content": json.dumps(tool_result),
            }
        )
        return await self._call_model()

    def get_usage(self) -> UsageInfo:
        return self._usage

    async def _call_model(self) -> AgentStep:
        response = await self._client.chat.completions.create(
            model=self.model_name,
            messages=self._messages,
            tools=self._tools,
            tool_choice="auto",
        )
        if response.usage:
            self._usage = UsageInfo(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
            )
        message = response.choices[0].message
        assistant_msg: dict = {"role": "assistant", "content": message.content}
        if message.tool_calls:
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": tc.type,
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in message.tool_calls
            ]
        self._messages.append(assistant_msg)

        if message.tool_calls:
            call = message.tool_calls[0]
            self._pending_tool_call_id = call.id
            args = json.loads(call.function.arguments or "{}")
            return AgentStep(kind="tool_call", tool_name=call.function.name, tool_args=args)
        return AgentStep(kind="done", result_text=message.content or "")
