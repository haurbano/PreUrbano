import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from analytics.database import get_db as analytics_get_db
from analytics.models import QuestionStats
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

    question = Question(subject=subject, correct_option=correct_option, image_path=filename)
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


@router.get("/questions", response_model=QuestionsPage)
def list_questions(
    subject: str | None = Query(None),
    id: int | None = Query(None),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    analytics_db: Session = Depends(analytics_get_db),
    _: str = Depends(verify_token),
):
    query = db.query(Question)
    if id is not None:
        query = query.filter(Question.id == id)
        items = query.all()
        total = len(items)
        pages = 1
    else:
        if subject:
            query = query.filter(Question.subject == subject)
        total = query.count()
        pages = max(1, -(-total // PAGE_SIZE))
        items = query.order_by(Question.created_at.desc()).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).all()

    stats_map: dict[int, QuestionStats] = {}
    if items:
        stats_rows = analytics_db.query(QuestionStats).filter(
            QuestionStats.question_id.in_([q.id for q in items])
        ).all()
        stats_map = {s.question_id: s for s in stats_rows}

    result_items = []
    for q in items:
        s = stats_map.get(q.id)
        attempts = s.total_attempts if s else 0
        correct_count = s.correct_attempts if s else 0
        accuracy_pct = round((correct_count / attempts) * 100) if attempts else None
        result_items.append(QuestionWithStats(
            id=q.id,
            subject=q.subject,
            correct_option=q.correct_option,
            image_path=q.image_path,
            group_id=q.group_id,
            created_at=q.created_at,
            attempts=attempts,
            correct_count=correct_count,
            accuracy_pct=accuracy_pct,
        ))

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
