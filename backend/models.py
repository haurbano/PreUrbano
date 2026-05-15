from datetime import datetime, timezone
from sqlalchemy import Boolean, String, DateTime, Integer, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from database import Base

DEFAULT_CONFIG = {
    "questions_per_simulation": 20,
    "subject_limits": {
        "matematicas": 4,
        "ciencias_naturales": 4,
        "lectura_critica": 4,
        "sociales": 4,
        "ingles": 4,
    },
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    google_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    picture: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    has_pro_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    document_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    grade: Mapped[str | None] = mapped_column(String(10), nullable=True)
    institution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class QuestionGroup(Base):
    __tablename__ = "question_groups"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subject: Mapped[str] = mapped_column(String(50), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    subject: Mapped[str] = mapped_column(String(50), index=True)
    correct_option: Mapped[str] = mapped_column(String(1))  # A|B|C|D
    image_path: Mapped[str] = mapped_column(String(255))
    is_pro: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    group_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("question_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class SimulationConfig(Base):
    __tablename__ = "simulation_config"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    questions_per_simulation: Mapped[int] = mapped_column(Integer, default=20)
    subject_limits: Mapped[dict] = mapped_column(JSON, default=lambda: {
        "matematicas": 4,
        "ciencias_naturales": 4,
        "lectura_critica": 4,
        "sociales": 4,
        "ingles": 4,
    })
    time_limit_minutes: Mapped[int] = mapped_column(Integer, default=0)


class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    total_questions: Mapped[int]
    correct_answers: Mapped[int]
    breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    timed_out: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Simulacro(Base):
    __tablename__ = "simulacros"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class SimulacroQuestion(Base):
    __tablename__ = "simulacro_questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    simulacro_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("simulacros.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
    order: Mapped[int] = mapped_column(Integer)


class SimulacroResult(Base):
    __tablename__ = "simulacro_results"
    __table_args__ = (UniqueConstraint("simulacro_id", "user_id", name="uq_simulacro_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    simulacro_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("simulacros.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    total_questions: Mapped[int]
    correct_answers: Mapped[int]
    breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    timed_out: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
