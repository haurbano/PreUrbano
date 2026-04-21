import os
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Cookie, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import SessionLocal
from models import User

SECRET = os.getenv("JWT_SECRET")
if not SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD environment variable is required")
ALGORITHM = "HS256"
EXPIRY_HOURS = 8

bearer = HTTPBearer()


def create_token() -> str:
    payload = {
        "sub": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Security(bearer)) -> str:
    try:
        jwt.decode(credentials.credentials, SECRET, algorithms=[ALGORITHM])
        return "admin"
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def create_user_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def verify_user_token_cookie(pu_auth: str | None = Cookie(default=None)) -> dict:
    if not pu_auth:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        data = jwt.decode(pu_auth, SECRET, algorithms=[ALGORITHM])
        if data.get("sub") == "admin":
            raise HTTPException(status_code=401, detail="Token inválido")
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == int(data["sub"])).first()
            if not user or not user.is_active:
                raise HTTPException(status_code=403, detail="Cuenta desactivada")
        finally:
            db.close()
        return data
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
