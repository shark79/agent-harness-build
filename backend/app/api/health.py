from fastapi import APIRouter
from app.config import settings

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/api/runtime")
async def runtime() -> dict:
    return {
        "provider": settings.harness_provider,
        "agent_name": settings.trueforge_agent_name if settings.harness_provider == "trueforge" else None,
        "trueforge_url": settings.trueforge_public_url if settings.harness_provider == "trueforge" else None,
    }
