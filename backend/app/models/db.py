"""Async SQLAlchemy engine/session setup.

Tables are created at startup via `init_models()` (Base.metadata.create_all,
run through `conn.run_sync` so it's async-safe) rather than hand-written
Supabase migrations, to fit the hackathon timeline. For anyone
productionizing this: the next step is real migrations under
`supabase/migrations/` (see the repo-root `supabase/` directory) driven off
these same model definitions.
"""
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.async_database_url, echo=False, future=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session


async def init_models() -> None:
    # Import models so they're registered on Base.metadata before create_all.
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
