"""Test-wide setup.

DATABASE_URL is pointed at a local sqlite file *before* any `app.*` module is
imported (env vars set here at collection time win over pydantic-settings'
.env-file loading). This sandbox cannot resolve DNS for the real Supabase
Postgres host (`db.<project-ref>.supabase.co`) - see requirements.txt for
details - so tests run against sqlite instead. Production code still talks
postgresql+asyncpg to the real DATABASE_URL; only this test DSN differs.
"""
import os
from pathlib import Path

_TEST_DB = Path(__file__).resolve().parent / ".test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DB}"
os.environ["HARNESS_PROVIDER"] = "local"  # tests must never call a configured live runtime
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("OPENAI_API_KEY", "")

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from app.models.db import Base, engine


@pytest.fixture(autouse=True)
async def _fresh_db():
    """Recreate all tables before every test for isolation."""
    import app.models  # noqa: F401  (register models on Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def wait_for_status(client, run_id, targets, timeout=5.0):
    """Poll GET /api/runs/{id} until status is one of `targets` (or raise)."""
    elapsed = 0.0
    step = 0.02
    while elapsed < timeout:
        resp = await client.get(f"/api/runs/{run_id}")
        status = resp.json()["status"]
        if status in targets:
            return resp.json()
        await asyncio.sleep(step)
        elapsed += step
    raise AssertionError(f"run {run_id} never reached {targets}, last status was {status!r}")
