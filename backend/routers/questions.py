import uuid
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
from models import UploadedFile, Question
from schemas import UploadedFileOut, QuestionOut, QuestionUpdate
from auth import verify_token

router = APIRouter()

UPLOADS_DIR = Path("/app/uploads")
IMAGES_DIR = UPLOADS_DIR / "images"
MAX_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "image",
    "image/png": "image",
}


def _process_upload(upload_id: int, file_path: str, file_type: str):
    """Background task: extract content and generate questions via AI."""
    db = SessionLocal()
    try:
        upload = db.query(UploadedFile).filter(UploadedFile.id == upload_id).first()
        if not upload:
            return

        from services.extractor import extract_from_pdf, extract_from_image
        from services.ai_generator import generate_questions

        if file_type == "pdf":
            content = extract_from_pdf(file_path)
        else:
            content = extract_from_image(file_path)

        questions_data = generate_questions(content["text"], content["images"])

        for q in questions_data:
            question = Question(
                upload_id=upload_id,
                subject=q["subject"],
                stem=q["stem"],
                option_a=q["option_a"],
                option_b=q["option_b"],
                option_c=q["option_c"],
                option_d=q["option_d"],
                correct_option=q["correct_option"],
                explanation=q.get("explanation"),
            )
            db.add(question)

        upload.status = "done"
        upload.questions_generated = len(questions_data)
        db.commit()

    except Exception as e:
        db.rollback()
        try:
            upload = db.query(UploadedFile).filter(UploadedFile.id == upload_id).first()
            if upload:
                upload.status = "error"
                upload.error_msg = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/upload", response_model=UploadedFileOut)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Solo se aceptan PDF, JPG o PNG.")

    file_data = await file.read()
    if len(file_data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="El archivo supera el límite de 20 MB.")

    ext = "pdf" if content_type == "application/pdf" else file.filename.rsplit(".", 1)[-1].lower()
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = str(UPLOADS_DIR / stored_name)

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    Path(file_path).write_bytes(file_data)

    upload = UploadedFile(
        original_name=file.filename or stored_name,
        stored_name=stored_name,
        file_type=ALLOWED_TYPES[content_type],
        status="processing",
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    background_tasks.add_task(_process_upload, upload.id, file_path, upload.file_type)
    return upload


@router.get("/uploads", response_model=list[UploadedFileOut])
def list_uploads(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    return db.query(UploadedFile).order_by(UploadedFile.created_at.desc()).all()


@router.get("/questions", response_model=list[QuestionOut])
def list_questions(
    status: str | None = Query(None),
    subject: str | None = Query(None),
    upload_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    q = db.query(Question)
    if status:
        q = q.filter(Question.status == status)
    if subject:
        q = q.filter(Question.subject == subject)
    if upload_id:
        q = q.filter(Question.upload_id == upload_id)
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
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(q, field, value)
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
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    db.delete(q)
    db.commit()
