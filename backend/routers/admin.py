import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Subscriber, User
from schemas import LoginRequest, TokenResponse, SubscriberOut, UserOut
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
