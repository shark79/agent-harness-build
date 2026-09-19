# TODO(next phase): real retry logic (exponential backoff, max attempts,
# incrementing Run.retry_count, transitioning through RunStatus.RETRYING)
# lands in the next dispatch. This is intentionally a no-op pass-through for
# now so HarnessOrchestrator._execute_and_continue has a clear seam to wrap
# the tool-call path with retries later, without restructuring the loop.
async def with_retry(func, *args, **kwargs):
    return await func(*args, **kwargs)
