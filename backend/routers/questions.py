import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import get_db
from models import Question, QuestionGroup, SimulationConfig
from schemas import QuestionOut, QuestionUpdate, QuestionGroupCreate, QuestionGroupOut, QuestionGroupDetail, QuestionWithStats
from auth import verify_token

router = APIRouter()

UPLOADS_DIR = Path("/app/uploads")
MAX_SIZE = 20 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
CONTENT_TYPE_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
SUBJECTS = {"matematicas", "ciencias_naturales", "lectura_critica", "sociales", "ingles"}
OPTIONS = {"A", "B", "C", "D"}


async def _validate_image_upload(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Solo se aceptan imágenes JPG, PNG o WebP.")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="La imagen supera el límite de 20 MB.")
    return data


@router.post("/questions", response_model=QuestionOut)
async def create_question(
    file: UploadFile = File(...),
    subject: str = Form(...),
    correct_option: str = Form(...),
    is_pro: bool = Form(False),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    if subject not in SUBJECTS:
        raise HTTPException(status_code=400, detail="Materia inválida.")

    correct_option = correct_option.upper()
    if correct_option not in OPTIONS:
        raise HTTPException(status_code=400, detail="La respuesta correcta debe ser A, B, C o D.")

    data = await _validate_image_upload(file)

    ext = CONTENT_TYPE_EXT[file.content_type]
    filename = f"{uuid.uuid4().hex}.{ext}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOADS_DIR / filename).write_bytes(data)

    question = Question(subject=subject, correct_option=correct_option, image_path=filename, is_pro=is_pro)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


PAGE_SIZE = 20


class QuestionsPage(BaseModel):
    items: list[QuestionWithStats]
    total: int
    page: int
    page_size: int
    pages: int

    model_config = {"from_attributes": True}


_ORDER_CLAUSES: dict[str | None, str] = {
    "difficulty_asc":  "accuracy_pct ASC NULLS LAST, q.id DESC",
    "difficulty_desc": "accuracy_pct DESC NULLS LAST, q.id DESC",
    None:              "q.created_at DESC",
}

_STATS_SELECT = """
    SELECT q.id, q.subject, q.correct_option, q.image_path,
           q.is_pro, q.group_id, q.created_at,
           COALESCE(s.total_attempts, 0)   AS attempts,
           COALESCE(s.correct_attempts, 0) AS correct_count,
           CASE WHEN s.total_attempts > 0
                THEN CAST(ROUND(100.0 * s.correct_attempts / s.total_attempts) AS INTEGER)
                END AS accuracy_pct
    FROM questions q
    LEFT JOIN analytics.question_stats s ON s.question_id = q.id
"""


@router.get("/questions", response_model=QuestionsPage)
def list_questions(
    subject: str | None = Query(None),
    id: int | None = Query(None),
    is_pro: bool | None = Query(None),
    sort: str | None = Query(None, pattern="^(difficulty_asc|difficulty_desc)$"),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    if id is not None:
        where, params = "q.id = :id", {"id": id}
        total = db.execute(text(f"SELECT COUNT(*) FROM questions q WHERE {where}"), params).scalar()
        offset, pages = 0, 1
    else:
        where, params = ("q.subject = :subject", {"subject": subject}) if subject else ("1=1", {})
        if is_pro is not None:
            where += " AND q.is_pro = :is_pro_val"
            params = {**params, "is_pro_val": 1 if is_pro else 0}
        total = db.execute(text(f"SELECT COUNT(*) FROM questions q WHERE {where}"), params).scalar()
        pages = max(1, -(-total // PAGE_SIZE))
        offset = (page - 1) * PAGE_SIZE

    order = _ORDER_CLAUSES.get(sort, _ORDER_CLAUSES[None])
    rows = db.execute(
        text(f"{_STATS_SELECT} WHERE {where} ORDER BY {order} LIMIT :limit OFFSET :offset"),
        {**params, "limit": PAGE_SIZE, "offset": offset},
    ).mappings().all()

    result_items = [
        QuestionWithStats(
            id=r["id"],
            subject=r["subject"],
            correct_option=r["correct_option"],
            image_path=r["image_path"],
            is_pro=bool(r["is_pro"]),
            group_id=r["group_id"],
            created_at=r["created_at"],
            attempts=r["attempts"],
            correct_count=r["correct_count"],
            accuracy_pct=r["accuracy_pct"],
        )
        for r in rows
    ]
    return QuestionsPage(items=result_items, total=total, page=page, page_size=PAGE_SIZE, pages=pages)


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

    if body.is_pro is not None:
        q.is_pro = body.is_pro

    if "group_id" in body.model_fields_set:
        if body.group_id is None:
            q.group_id = None
        else:
            group = db.query(QuestionGroup).filter(QuestionGroup.id == body.group_id).first()
            if not group:
                raise HTTPException(status_code=404, detail="Grupo no encontrado.")
            subject = body.subject if body.subject is not None else q.subject
            if group.subject != subject:
                raise HTTPException(
                    status_code=400,
                    detail=f"El grupo es de materia '{group.subject}' pero la pregunta es de '{subject}'."
                )
            # Count current group members, excluding this question if already in it
            member_count = db.query(Question).filter(
                Question.group_id == body.group_id,
                Question.id != question_id,
            ).count()
            config = db.query(SimulationConfig).filter(SimulationConfig.id == 1).first()
            limit = config.subject_limits.get(subject, 0) if config else 0
            if limit > 0 and member_count + 1 > limit:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"El grupo ya tiene {member_count} pregunta(s). "
                        f"Agregar una más superaría el límite de {limit} para '{subject}'."
                    )
                )
            q.group_id = body.group_id

    db.commit()
    db.refresh(q)
    return q


@router.post("/questions/groups", response_model=QuestionGroupOut)
def create_group(
    body: QuestionGroupCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    if body.subject not in SUBJECTS:
        raise HTTPException(status_code=400, detail="Materia inválida.")
    group = QuestionGroup(name=body.name, subject=body.subject)
    db.add(group)
    db.commit()
    db.refresh(group)
    return QuestionGroupOut(
        id=group.id,
        name=group.name,
        subject=group.subject,
        created_at=group.created_at,
        question_count=0,
    )


@router.get("/questions/groups", response_model=list[QuestionGroupOut])
def list_groups(
    subject: str | None = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    q = db.query(QuestionGroup)
    if subject:
        q = q.filter(QuestionGroup.subject == subject)
    groups = q.order_by(QuestionGroup.created_at.desc()).all()
    result = []
    for g in groups:
        count = db.query(Question).filter(Question.group_id == g.id).count()
        result.append(QuestionGroupOut(
            id=g.id, name=g.name, subject=g.subject, created_at=g.created_at, question_count=count
        ))
    return result


@router.get("/questions/groups/{group_id}", response_model=QuestionGroupDetail)
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    group = db.query(QuestionGroup).filter(QuestionGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado.")
    members = db.query(Question).filter(Question.group_id == group_id).order_by(Question.id).all()
    return QuestionGroupDetail(
        id=group.id,
        name=group.name,
        subject=group.subject,
        created_at=group.created_at,
        question_count=len(members),
        questions=members,
    )


@router.delete("/questions/groups/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    group = db.query(QuestionGroup).filter(QuestionGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado.")
    # Unassign all member questions
    db.query(Question).filter(Question.group_id == group_id).update({"group_id": None})
    db.delete(group)
    db.commit()


@router.patch("/questions/{question_id}/image", response_model=QuestionOut)
async def replace_question_image(
    question_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada.")

    data = await _validate_image_upload(file)

    ext = CONTENT_TYPE_EXT[file.content_type]
    new_filename = f"{uuid.uuid4().hex}.{ext}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOADS_DIR / new_filename).write_bytes(data)

    old_path = UPLOADS_DIR / q.image_path
    if old_path.exists():
        old_path.unlink()

    q.image_path = new_filename
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
