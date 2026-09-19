# TODO(next phase): real budget enforcement against MAX_RUN_TOKENS /
# MAX_RUN_COST (transitioning a run to RunStatus.BUDGET_EXCEEDED) lands in
# the next dispatch. Run.tokens/estimated_cost are already tracked this phase
# so this check has real numbers to work with once implemented. Stubbed as
# an always-ok check for now.
def check_budget(tokens_used: int, cost_used: float) -> bool:
    return True
