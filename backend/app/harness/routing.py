# TODO(next phase): real PRIMARY_MODEL -> FALLBACK_MODEL routing on model
# failure/DEMO_FORCE_MODEL_FAILURE lands in the next dispatch.
# HarnessOrchestrator._call_model is the single seam where this would plug
# in. Stubbed to always return the primary model for now.
from app.config import settings


def choose_model() -> str:
    return settings.primary_model
