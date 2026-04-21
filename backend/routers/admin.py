import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
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
)
from auth import create_token, verify_token, ADMIN_PASSWORD

router = APIRouter()

_admin_html: str | None = None


def _load_admin_html() -> str:
    global _admin_html
    if _admin_html is None:
        path = os.path.join(os.path.dirname(__file__), "..", "admin.html")
        with open(path, encoding="utf-8") as f:
            _admin_html = f.read()
    return _admin_html


@router.get("/", response_class=HTMLResponse)
def admin_ui():
    return _load_admin_html()


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
