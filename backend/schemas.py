from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator


class SubscribeRequest(BaseModel):
    email: EmailStr
    source: str = "hero"

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        if v not in ("hero", "cta"):
            return "hero"
        return v


class SubscriberOut(BaseModel):
    id: int
    email: str
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SubscribersListOut(BaseModel):
    items: list[SubscriberOut]
    total: int
    total_hero: int
    total_cta: int
    page: int
    page_size: int
    pages: int


class LoginRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    access_token: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    picture: str | None
    is_active: bool
    has_pro_access: bool = False
    document_id: str | None
    phone: str | None
    grade: str | None
    institution: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    name: str
    document_id: str | None = None
    phone: str | None = None
    grade: str | None = None
    institution: str | None = None


class QuestionOut(BaseModel):
    id: int
    subject: str
    correct_option: str
    image_path: str
    is_pro: bool = False
    group_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionWithStats(QuestionOut):
    attempts: int = 0
    correct_count: int = 0
    accuracy_pct: int | None = None


class SubjectDifficultyOut(BaseModel):
    subject: str
    attempts: int
    correct: int
    accuracy_pct: int | None
    question_count: int


class QuestionUpdate(BaseModel):
    subject: str | None = None
    correct_option: str | None = None
    is_pro: bool | None = None
    group_id: int | None = None  # None + in model_fields_set → unassign


class QuestionGroupCreate(BaseModel):
    name: str | None = None
    subject: str


class QuestionGroupOut(BaseModel):
    id: int
    name: str | None
    subject: str
    created_at: datetime
    question_count: int

    model_config = {"from_attributes": True}


class QuestionGroupDetail(BaseModel):
    id: int
    name: str | None
    subject: str
    created_at: datetime
    question_count: int
    questions: list[QuestionOut]

    model_config = {"from_attributes": True}


class UsersListOut(BaseModel):
    items: list[UserOut]
    total: int
    total_active: int
    page: int
    page_size: int
    pages: int


class UserEnableUpdate(BaseModel):
    is_active: bool | None = None
    has_pro_access: bool | None = None


class SimulationConfigOut(BaseModel):
    id: int
    questions_per_simulation: int
    subject_limits: dict
    time_limit_minutes: int

    model_config = {"from_attributes": True}


class SimulationConfigUpdate(BaseModel):
    questions_per_simulation: int | None = None
    subject_limits: dict | None = None
    time_limit_minutes: int | None = None


class SimulationResultOut(BaseModel):
    id: int
    user_id: int
    total_questions: int
    correct_answers: int
    breakdown: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionForSim(BaseModel):
    id: int
    subject: str
    image_path: str
    correct_option: str
    group_id: int | None = None


class SimulationStartOut(BaseModel):
    simulation_id: str
    questions: list[QuestionForSim]
    total_available: int
    warning: str | None = None
    time_limit_minutes: int = 0


class SimulationAnswerIn(BaseModel):
    simulation_id: str
    question_id: int
    selected_option: str


class SimulationStartIn(BaseModel):
    subjects: list[str] | None = None
    total_questions: int | None = None


class SimulationSubmitIn(BaseModel):
    simulation_id: str
    answers: list[dict]
    timed_out: bool = False
    duration_seconds: int | None = None


class SimulationSubmitOut(BaseModel):
    score: int
    total: int
    correct: int
    incorrect: int
    breakdown: dict
    timed_out: bool = False


class SubjectBreakdown(BaseModel):
    correct: int
    total: int


class SimulationSummary(BaseModel):
    id: int
    created_at: datetime
    total_questions: int
    correct_answers: int
    incorrect_answers: int
    score_pct: int
    breakdown: dict
    timed_out: bool = False
    duration_seconds: int | None = None


class StudentSimulationsOut(BaseModel):
    items: list[SimulationSummary]
    total: int


class StudentAdminOut(BaseModel):
    user_id: int
    name: str
    email: str
    picture: str | None
    is_active: bool
    total_simulations: int
    avg_score: int
    total_correct: int
    total_questions: int
    last_sim_date: datetime | None
    by_subject: dict[str, SubjectBreakdown]


class StudentsListOut(BaseModel):
    items: list[StudentAdminOut]
    total: int


class SimulationHistoryOut(BaseModel):
    items: list[SimulationResultOut]
    total: int
    page: int
    page_size: int
    pages: int


class StudentProgressOut(BaseModel):
    total_simulations: int
    total_questions: int
    total_correct: int
    total_incorrect: int
    by_subject: dict[str, SubjectBreakdown]
    simulations: list[SimulationSummary]


# ── Simulacros curados ────────────────────────────────────────────────────────

class SimulacroCreate(BaseModel):
    name: str = Field(..., max_length=150)
    time_limit_minutes: int = 0
    question_ids: list[int] = []

    @field_validator("question_ids")
    @classmethod
    def no_duplicates(cls, v: list[int]) -> list[int]:
        if len(v) != len(set(v)):
            raise ValueError("No se permiten preguntas duplicadas.")
        return v


class SimulacroUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    time_limit_minutes: int | None = None
    question_ids: list[int] | None = None

    @field_validator("question_ids")
    @classmethod
    def no_duplicates(cls, v: list[int] | None) -> list[int] | None:
        if v is not None and len(v) != len(set(v)):
            raise ValueError("No se permiten preguntas duplicadas.")
        return v


class SimulacroSummary(BaseModel):
    id: int
    name: str
    is_active: bool
    time_limit_minutes: int
    question_count: int
    attempts_count: int
    created_at: datetime


class SimulacroDetail(SimulacroSummary):
    questions: list[QuestionOut]


class SimulacroSubmitOut(BaseModel):
    score: int
    total: int
    correct: int
    incorrect: int
    breakdown: dict
    timed_out: bool = False


class SimulacroAvailable(BaseModel):
    available: bool
    simulacro_id: int | None = None
    name: str | None = None
    question_count: int | None = None
    time_limit_minutes: int | None = None
    already_taken: bool = False
    last_result: SimulacroSubmitOut | None = None


class SimulacroStartOut(BaseModel):
    simulacro_id: int
    session_id: str
    name: str
    questions: list[QuestionForSim]
    time_limit_minutes: int


class SimulacroSubmitIn(BaseModel):
    simulacro_id: int
    session_id: str
    answers: list[dict]
    timed_out: bool = False


class SimulacroResultAdminRow(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    score: int
    total_questions: int
    correct_answers: int
    timed_out: bool
    created_at: datetime


class SimulacroResultsAdminOut(BaseModel):
    items: list[SimulacroResultAdminRow]
    total: int
