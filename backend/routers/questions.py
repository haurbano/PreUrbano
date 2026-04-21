import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Question
from schemas import QuestionOut, QuestionUpdate
from auth import verify_token

router = APIRouter()

UPLOADS_DIR = Path("/app/uploads")
MAX_SIZE = 20 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
SUBJECTS = {"matematicas", "ciencias_naturales", "lectura_critica", "sociales", "ingles"}
OPTIONS = {"A", "B", "C", "D"}


@router.post("/questions", response_model=QuestionOut)
async def create_question(
    file: UploadFile = File(...),
    subject: str = Form(...),
    correct_option: str = Form(...),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Solo se aceptan imágenes JPG, PNG o WebP.")

    if subject not in SUBJECTS:
        raise HTTPException(status_code=400, detail="Materia inválida.")

    correct_option = correct_option.upper()
    if correct_option not in OPTIONS:
        raise HTTPException(status_code=400, detail="La respuesta correcta debe ser A, B, C o D.")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="La imagen supera el límite de 20 MB.")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOADS_DIR / filename).write_bytes(data)

    question = Question(subject=subject, correct_option=correct_option, image_path=filename)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.get("/questions", response_model=list[QuestionOut])
def list_questions(
    subject: str | None = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    q = db.query(Question)
    if subject:
        q = q.filter(Question.subject == subject)
    return q.order_by(Question.created_at.desc()).all()


@router.patch("/questions/{question_id}", response_model=QuestionOut)
def update_question(
    question_id: int,
    body: QuestionUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada.")

    if body.subject is not None:
        if body.subject not in SUBJECTS:
            raise HTTPException(status_code=400, detail="Materia inválida.")
        q.subject = body.subject

    if body.correct_option is not None:
        opt = body.correct_option.upper()
        if opt not in OPTIONS:
            raise HTTPException(status_code=400, detail="La respuesta correcta debe ser A, B, C o D.")
        q.correct_option = opt

    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada.")
    # Remove image file
    img = UPLOADS_DIR / q.image_path
    if img.exists():
        img.unlink()
    db.delete(q)
    db.commit()
