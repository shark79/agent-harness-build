"""App settings, loaded from the repo-root .env (shared with frontend/supabase)."""
import re
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"

# Matches scheme://user:password@host[:port][/database] where password may
# contain unencoded special characters (Supabase-generated passwords can
# include "/"), which breaks naive urlparse/str.split handling.
_DSN_RE = re.compile(
    r"^(?P<scheme>postgres(?:ql)?)://(?P<user>[^:@/]+):(?P<password>.+)@(?P<hostinfo>[^@]+)$"
)


def to_async_database_url(raw: str) -> str:
    """Normalize a DATABASE_URL for use with an async SQLAlchemy engine.

    - sqlite URLs pass through unchanged (used by the test suite).
    - postgres/postgresql URLs become postgresql+asyncpg, with the userinfo
      safely re-encoded via SQLAlchemy's URL builder (handles special
      characters like "/" in the password that plain string concatenation
      or urlparse would mishandle).
    """
    if raw.startswith("sqlite"):
        return raw
    match = _DSN_RE.match(raw)
    if not match:
        return raw.replace("postgresql://", "postgresql+asyncpg://", 1).replace(
            "postgres://", "postgresql+asyncpg://", 1
        )
    host_port, _, database = match.group("hostinfo").partition("/")
    host, _, port = host_port.partition(":")
    url = URL.create(
        "postgresql+asyncpg",
        username=match.group("user"),
        password=match.group("password"),
        host=host,
        port=int(port) if port else None,
        database=database or None,
    )
    return url.render_as_string(hide_password=False)


class Settings(BaseSettings):
    environment: str = "development"
    demo_mode: bool = True
    demo_force_model_failure: bool = False

    openai_api_key: str = ""
    primary_model: str = "gpt-4o-mini"
    fallback_model: str = "gpt-4o"

    max_run_tokens: int = 20000
    max_run_cost: float = 0.50

    email_mode: str = "demo"

    database_url: str = "sqlite+aiosqlite:///./local.db"
    backend_cors_origins: str = ""

    # Optional; defaults to the fully-functional local provider. Not
    # over-built per the brief - "trueforge" just selects the NotImplemented
    # stub extension point (see app/harness/provider.py).
    harness_provider: str = "local"

    model_config = SettingsConfigDict(
        env_file=str(_ROOT_ENV), env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def async_database_url(self) -> str:
        return to_async_database_url(self.database_url)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]


settings = Settings()
