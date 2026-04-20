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


class UploadedFileOut(BaseModel):
    id: int
    original_name: str
    file_type: str
    status: str
    error_msg: str | None
    questions_generated: int
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionOut(BaseModel):
    id: int
    upload_id: int
    subject: str
    stem: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    explanation: str | None
    image_path: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionUpdate(BaseModel):
    status: str | None = None
    stem: str | None = None
    option_a: str | None = None
    option_b: str | None = None
    option_c: str | None = None
    option_d: str | None = None
    correct_option: str | None = None
    explanation: str | None = None
