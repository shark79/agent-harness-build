"""Durable link to TrueForge; separate table avoids altering existing run tables."""
from sqlalchemy import JSON, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.db import Base


class TrueForgeRun(Base):
    __tablename__ = "trueforge_runs"

    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    turn_id: Mapped[str | None] = mapped_column(String, nullable=True)
    pending: Mapped[list] = mapped_column(JSON, default=list)
    submission_uncertain: Mapped[bool] = mapped_column(Boolean, default=False)
