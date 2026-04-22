from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Subscriber, User, SimulationConfig, SimulationResult
from schemas import (
    LoginRequest,
    TokenResponse,
    SubscriberOut,
    UserOut,
    UserEnableUpdate,
    SimulationConfigOut,
    SimulationConfigUpdate,
    SimulationHistoryOut,
    SimulationResultOut,
    StudentsListOut,
    StudentSimulationsOut,
    StudentSimulationSummary,
)
from auth import create_token, verify_token, ADMIN_PASSWORD

router = APIRouter()

_admin_html_path = Path(__file__).parent.parent / "admin.html"


@router.get("/", response_class=FileResponse)
def admin_ui():
    return FileResponse(_admin_html_path, media_type="text/html")


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return {"access_token": create_token()}


@router.get("/subscribers", response_model=list[SubscriberOut])
def list_subscribers(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    return db.query(Subscriber).order_by(Subscriber.created_at.desc()).all()


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserEnableUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return user


@router.get("/simulation/config", response_model=SimulationConfigOut)
def get_simulation_config(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    config = db.query(SimulationConfig).filter(SimulationConfig.id == 1).first()
    if not config:
        config = SimulationConfig(
            id=1,
            questions_per_simulation=20,
            subject_limits={
                "matematicas": 4,
                "ciencias_naturales": 4,
                "lectura_critica": 4,
                "sociales": 4,
                "ingles": 4,
            },
            time_limit_minutes=0,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.put("/simulation/config", response_model=SimulationConfigOut)
def update_simulation_config(
    body: SimulationConfigUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    config = db.query(SimulationConfig).filter(SimulationConfig.id == 1).first()
    if not config:
        config = SimulationConfig(id=1)
        db.add(config)
        db.flush()

    if body.questions_per_simulation is not None:
        config.questions_per_simulation = body.questions_per_simulation
    if body.subject_limits is not None:
        config.subject_limits = body.subject_limits
    if body.time_limit_minutes is not None:
        config.time_limit_minutes = body.time_limit_minutes

    db.commit()
    db.refresh(config)
    return config


@router.get("/simulations", response_model=SimulationHistoryOut)
def list_simulations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: int | None = None,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    query = db.query(SimulationResult).order_by(SimulationResult.created_at.desc())
    if user_id is not None:
        query = query.filter(SimulationResult.user_id == user_id)

    total = query.count()
    pages = (total + page_size - 1) // page_size if total > 0 else 1
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    return SimulationHistoryOut(
        items=[SimulationResultOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/students", response_model=StudentsListOut)
def list_students(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    items = []
    for user in users:
        results = (
            db.query(SimulationResult)
            .filter(SimulationResult.user_id == user.id)
            .order_by(SimulationResult.created_at.desc())
            .limit(10)
            .all()
        )
        total_sim = len(results)
        total_questions = sum(r.total_questions for r in results)
        total_correct = sum(r.correct_answers for r in results)
        avg_score = 0
        if results:
            avg_score = round(sum(r.correct_answers / r.total_questions * 100 for r in results if r.total_questions) / len(results))
        last_sim_date = results[0].created_at if results else None
        by_subject: dict[str, dict[str, int]] = {}
        for r in results:
            for subject, bd in (r.breakdown or {}).items():
                agg = by_subject.setdefault(subject, {"correct": 0, "total": 0})
                agg["correct"] += bd.get("correct", 0)
                agg["total"] += bd.get("total", 0)
        items.append({
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "picture": user.picture,
            "is_active": user.is_active,
            "total_simulations": total_sim,
            "avg_score": avg_score,
            "total_correct": total_correct,
            "total_questions": total_questions,
            "last_sim_date": last_sim_date,
            "by_subject": by_subject,
        })
    return StudentsListOut(items=items, total=len(items))


@router.get("/students/{user_id}/simulations", response_model=StudentSimulationsOut)
def get_student_simulations(
    user_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    results = (
        db.query(SimulationResult)
        .filter(SimulationResult.user_id == user_id)
        .order_by(SimulationResult.created_at.desc())
        .limit(10)
        .all()
    )
    items = []
    for r in results:
        score_pct = round((r.correct_answers / r.total_questions) * 100) if r.total_questions else 0
        items.append(StudentSimulationSummary(
            id=r.id,
            created_at=r.created_at,
            total_questions=r.total_questions,
            correct_answers=r.correct_answers,
            incorrect_answers=r.total_questions - r.correct_answers,
            score_pct=score_pct,
            breakdown=r.breakdown or {},
            timed_out=r.timed_out,
        ))
    return StudentSimulationsOut(items=items, total=len(items))
