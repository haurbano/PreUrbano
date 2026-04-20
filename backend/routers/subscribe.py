from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import Subscriber
from schemas import SubscribeRequest

router = APIRouter()


@router.post("/subscribe")
def subscribe(body: SubscribeRequest, db: Session = Depends(get_db)):
    subscriber = Subscriber(email=body.email, source=body.source)
    db.add(subscriber)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Este correo ya está registrado")
    return {"ok": True}
