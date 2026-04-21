from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


class SubscribeRequest(BaseModel):
    email: str
    source: str = "hero"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Email inválido")
        return v

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
    document_id: str | None
    phone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    name: str
    document_id: str | None = None
    phone: str | None = None


class QuestionOut(BaseModel):
    id: int
    subject: str
    correct_option: str
    image_path: str
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionUpdate(BaseModel):
    subject: str | None = None
    correct_option: str | None = None


class UserEnableUpdate(BaseModel):
    is_active: bool


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


class SimulationSubmitIn(BaseModel):
    simulation_id: str
    answers: list[dict]
    timed_out: bool = False


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


class SimulationHistoryOut(BaseModel):
    items: list[SimulationResultOut]
    total: int
    page: int
    page_size: int
    pages: int


class SimulationSummary(BaseModel):
    id: int
    created_at: datetime
    total_questions: int
    correct_answers: int
    incorrect_answers: int
    score_pct: int
    breakdown: dict


class StudentProgressOut(BaseModel):
    total_simulations: int
    total_questions: int
    total_correct: int
    total_incorrect: int
    by_subject: dict[str, SubjectBreakdown]
    simulations: list[SimulationSummary]
