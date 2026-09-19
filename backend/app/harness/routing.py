"""ModelRouter - tracks which model (PRIMARY_MODEL or FALLBACK_MODEL, both
env-configured) a run is currently using, and the demo-only deterministic
forced-failure simulation used to exercise the retry/fallback path without a
real provider outage.

HarnessOrchestrator._call_model is the single seam that consults this, once
per run (one ModelRouter instance lives on that run's _ActiveRun).
"""
from app.config import settings
from app.harness.retry import TemporaryProviderError


class ModelRouter:
    def __init__(self, force_failure: bool = False) -> None:
        self.primary_model = settings.primary_model
        self.fallback_model = settings.fallback_model
        self._on_fallback = False
        self._force_failure = force_failure

    @property
    def current_model(self) -> str:
        return self.fallback_model if self._on_fallback else self.primary_model

    @property
    def fallback_triggered(self) -> bool:
        return self._on_fallback

    def trigger_fallback(self) -> None:
        self._on_fallback = True

    def maybe_force_failure(self) -> None:
        """DEMO_FORCE_MODEL_FAILURE (or the per-run `force_model_failure`
        override) simulates a deterministic primary-model outage: every call
        made while still on the primary model raises a retryable error, so
        `retry.with_retry` always exhausts its attempts and the orchestrator
        falls back - reliably, without depending on any real provider ever
        actually failing. Once `trigger_fallback()` has switched this router
        to the fallback model, this is a no-op, so the fallback call always
        succeeds.
        """
        if self._force_failure and not self._on_fallback:
            raise TemporaryProviderError("DEMO_FORCE_MODEL_FAILURE: simulated primary-model outage")
