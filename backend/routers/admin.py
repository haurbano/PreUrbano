from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Subscriber, User, SimulationConfig, SimulationResult, DEFAULT_CONFIG
from schemas import (
    LoginRequest,
    TokenResponse,
    SubscriberOut,
    SubscribersListOut,
    UserOut,
    UsersListOut,
    UserEnableUpdate,
    SimulationConfigOut,
    SimulationConfigUpdate,
    SimulationHistoryOut,
    SimulationResultOut,
    SimulationSummary,
    StudentsListOut,
    StudentSimulationsOut,
)
from auth import create_token, verify_token, ADMIN_PASSWORD
from utils.scoring import score_pct

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


@router.get("/subscribers", response_model=SubscribersListOut)
def list_subscribers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    query = db.query(Subscriber).order_by(Subscriber.created_at.desc())
    total = query.count()
    total_hero = db.query(Subscriber).filter(Subscriber.source == "hero").count()
    pages = (total + page_size - 1) // page_size if total > 0 else 1
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return SubscribersListOut(
        items=items, total=total, total_hero=total_hero, total_cta=total - total_hero,
        page=page, page_size=page_size, pages=pages,
    )


@router.get("/users", response_model=UsersListOut)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    query = db.query(User).filter(User.is_deleted == False)
    total = query.count()
    total_active = db.query(User).filter(User.is_deleted == False, User.is_active == True).count()
    pages = (total + page_size - 1) // page_size if total > 0 else 1
    items = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return UsersListOut(
        items=items, total=total, total_active=total_active,
        page=page, page_size=page_size, pages=pages,
    )


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserEnableUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.is_deleted = True
    db.commit()


@router.get("/simulation/config", response_model=SimulationConfigOut)
def get_simulation_config(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    config = db.query(SimulationConfig).filter(SimulationConfig.id == 1).first()
    if not config:
        config = SimulationConfig(
            id=1,
            questions_per_simulation=DEFAULT_CONFIG["questions_per_simulation"],
            subject_limits=DEFAULT_CONFIG["subject_limits"],
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
    users = db.query(User).filter(User.is_deleted == False).order_by(User.created_at.desc()).all()
    if not users:
        return StudentsListOut(items=[], total=0)

    user_ids = [u.id for u in users]
    all_results = (
        db.query(SimulationResult)
        .filter(SimulationResult.user_id.in_(user_ids))
        .order_by(SimulationResult.created_at.desc())
        .all()
    )

    results_by_user: dict[int, list] = {}
    for r in all_results:
        bucket = results_by_user.setdefault(r.user_id, [])
        if len(bucket) < 10:
            bucket.append(r)

    items = []
    for user in users:
        results = results_by_user.get(user.id, [])
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
        items.append(SimulationSummary(
            id=r.id,
            created_at=r.created_at,
            total_questions=r.total_questions,
            correct_answers=r.correct_answers,
            incorrect_answers=r.total_questions - r.correct_answers,
            score_pct=score_pct(r.correct_answers, r.total_questions),
            breakdown=r.breakdown or {},
            timed_out=r.timed_out,
            duration_seconds=r.duration_seconds,
        ))
    return StudentSimulationsOut(items=items, total=len(items))
