# TODO(next phase): automated evaluation criteria (persisting Evaluation
# rows, emitting EVALUATION_STARTED/EVALUATION_COMPLETED trace events - both
# already exist in the schema/enum this phase) lands in the next dispatch.
# HarnessOrchestrator._complete_run is the seam to call this from. Stubbed
# as a no-op for now.
async def evaluate_run(run_id: str) -> list:
    return []
