"""Bounded retry for model calls, plus the exception vocabulary an
AgentAdapter (or the demo-failure simulation in routing.py) raises to signal
retryable vs. non-retryable model failures.

HarnessOrchestrator._call_model is the only caller: it wraps a single model
call attempt in `with_retry`, using `on_retry` to record a RETRY_STARTED
trace event and bump Run.retry_count between attempts.
"""
import asyncio

MAX_ATTEMPTS = 2
# Demo-fast backoff - NOT realistic production backoff durations.
_BACKOFF_SECONDS = (0.1, 0.2)


class RetryableModelError(Exception):
    """Base for failures worth retrying: timeouts, rate limits, transient
    provider errors."""


class ModelTimeoutError(RetryableModelError):
    pass


class RateLimitError(RetryableModelError):
    pass


class TemporaryProviderError(RetryableModelError):
    pass


class NonRetryableModelError(Exception):
    """Base for failures that should fail the run immediately - retrying
    can't help."""


class AuthenticationError(NonRetryableModelError):
    pass


class InvalidRequestError(NonRetryableModelError):
    pass


class PermissionDeniedError(NonRetryableModelError):
    pass


class RetryExhausted(Exception):
    """Raised once a retryable operation has failed `max_attempts` times."""

    def __init__(self, attempts: int, last_error: Exception) -> None:
        super().__init__(f"exhausted {attempts} attempt(s): {last_error}")
        self.attempts = attempts
        self.last_error = last_error


async def with_retry(func, *args, on_retry=None, max_attempts: int = MAX_ATTEMPTS, **kwargs):
    """Call `func(*args, **kwargs)`.

    - RetryableModelError: retried up to `max_attempts` total attempts, with
      a short backoff and `on_retry(attempt, error)` called before each
      retry (attempt is 1-indexed, the attempt number that just failed).
    - NonRetryableModelError (or anything else): propagates immediately, no
      retry - the caller fails the run right away.
    - Raises RetryExhausted if every attempt failed with a retryable error.
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await func(*args, **kwargs)
        except RetryableModelError as exc:
            last_exc = exc
            if attempt >= max_attempts:
                break
            if on_retry is not None:
                await on_retry(attempt, exc)
            await asyncio.sleep(_BACKOFF_SECONDS[min(attempt - 1, len(_BACKOFF_SECONDS) - 1)])
    raise RetryExhausted(max_attempts, last_exc)
