from app.config import settings
from app.harness.retry import (
    AuthenticationError,
    RetryExhausted,
    TemporaryProviderError,
    with_retry,
)
from tests.conftest import wait_for_status

import pytest


async def test_with_retry_succeeds_after_one_retryable_failure():
    attempts = []

    async def flaky():
        attempts.append(1)
        if len(attempts) < 2:
            raise TemporaryProviderError("boom")
        return "ok"

    retried = []

    async def on_retry(attempt, exc):
        retried.append((attempt, str(exc)))

    result = await with_retry(flaky, on_retry=on_retry)

    assert result == "ok"
    assert len(attempts) == 2
    assert retried == [(1, "boom")]


async def test_with_retry_raises_retry_exhausted_after_max_attempts():
    async def always_fails():
        raise TemporaryProviderError("still down")

    with pytest.raises(RetryExhausted) as exc_info:
        await with_retry(always_fails, max_attempts=2)

    assert exc_info.value.attempts == 2
    assert isinstance(exc_info.value.last_error, TemporaryProviderError)


async def test_with_retry_does_not_retry_non_retryable_errors():
    calls = []

    async def bad_auth():
        calls.append(1)
        raise AuthenticationError("invalid api key")

    with pytest.raises(AuthenticationError):
        await with_retry(bad_auth)

    assert len(calls) == 1  # never retried


async def test_demo_force_model_failure_retries_then_falls_back_and_completes(client):
    resp = await client.post(
        "/api/runs",
        json={"task": "research the latest LLM benchmarks", "force_model_failure": True},
    )
    run_id = resp.json()["id"]

    state = await wait_for_status(client, run_id, {"COMPLETED", "FAILED"})
    assert state["status"] == "COMPLETED"
    assert state["retry_count"] == 1
    assert state["model"] == settings.fallback_model

    trace = (await client.get(f"/api/runs/{run_id}/trace")).json()
    types = [e["type"] for e in trace]

    assert types[0] == "RUN_STARTED"
    assert "RETRY_STARTED" in types
    assert "FALLBACK_TRIGGERED" in types
    assert types.index("MODEL_CALL_STARTED") < types.index("RETRY_STARTED")
    assert types.index("RETRY_STARTED") < types.index("FALLBACK_TRIGGERED")
    assert types.index("FALLBACK_TRIGGERED") < types.index("MODEL_CALL_COMPLETED")
    assert types[-1] == "RUN_COMPLETED"
