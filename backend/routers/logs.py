from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from analytics.database import get_db
from analytics.models import ImageLoadError
from auth import verify_user_token_cookie

router = APIRouter()


class ImageLoadErrorIn(BaseModel):
    question_id: int | None = None
    image_path: str
    attempts: int = 3


@router.post("/log/image-error", status_code=204)
async def log_image_error(
    payload: ImageLoadErrorIn,
    request: Request,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_user_token_cookie),
):
    db.add(ImageLoadError(
        question_id=payload.question_id,
        image_path=payload.image_path,
        attempts=payload.attempts,
        user_id=int(token_data["sub"]),
        user_agent=request.headers.get("user-agent"),
    ))
    db.commit()
