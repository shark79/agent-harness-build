"""Budget tracking: cumulative token/cost usage per run against
MAX_RUN_TOKENS / MAX_RUN_COST (env), priced via a simple, clearly-labeled
"Estimated Cost" model - never exact provider billing.

HarnessOrchestrator._call_model is the only caller: it adds usage after every
model call and checks the result against the configured limits.
"""
from dataclasses import dataclass
from enum import StrEnum

from app.config import settings

# $ per 1K tokens - illustrative "Estimated Cost" figures for this demo, not
# real provider pricing. Unknown models fall back to _DEFAULT_PRICE_PER_1K.
PRICE_PER_1K_TOKENS: dict[str, float] = {
    "gpt-4o-mini": 0.00015,
    "gpt-4o": 0.005,
    "demo-agent": 0.0001,
}
_DEFAULT_PRICE_PER_1K = 0.001

WARNING_THRESHOLD = 0.8


class BudgetStatus(StrEnum):
    OK = "OK"
    WARNING = "WARNING"
    EXCEEDED = "EXCEEDED"


@dataclass
class BudgetCheck:
    status: BudgetStatus
    tokens_used: int
    cost_used: float


class BudgetExceededError(Exception):
    """Raised by HarnessOrchestrator._call_model when a run crosses 100% of
    either budget limit; carries the AgentStep in flight so the orchestrator
    can preserve whatever partial result already existed.
    """

    def __init__(self, step) -> None:
        super().__init__("run exceeded configured token/cost budget")
        self.step = step


def estimate_cost(model: str, tokens: int) -> float:
    """Estimated Cost only - never claims exact billing."""
    price = PRICE_PER_1K_TOKENS.get(model, _DEFAULT_PRICE_PER_1K)
    return (tokens / 1000) * price


def check_budget(
    tokens_used: int, cost_used: float, *, max_tokens: int | None = None, max_cost: float | None = None
) -> BudgetCheck:
    max_tokens = settings.max_run_tokens if max_tokens is None else max_tokens
    max_cost = settings.max_run_cost if max_cost is None else max_cost
    tokens_fraction = (tokens_used / max_tokens) if max_tokens else 0.0
    cost_fraction = (cost_used / max_cost) if max_cost else 0.0
    fraction = max(tokens_fraction, cost_fraction)
    if fraction >= 1.0:
        status = BudgetStatus.EXCEEDED
    elif fraction >= WARNING_THRESHOLD:
        status = BudgetStatus.WARNING
    else:
        status = BudgetStatus.OK
    return BudgetCheck(status=status, tokens_used=tokens_used, cost_used=cost_used)
