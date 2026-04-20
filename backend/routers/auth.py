import os
from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse
from authlib.integrations.httpx_client import AsyncOAuth2Client
from database import SessionLocal
from models import User
from auth import create_user_token, verify_user_token
from schemas import UserOut, UserProfileUpdate

router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://preurbano.com")
REDIRECT_URI = f"{APP_BASE_URL}/auth/google/callback"

AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("/google/login")
async def google_login(request: Request):
    client = AsyncOAuth2Client(
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope="openid email profile",
    )
    uri, state = client.create_authorization_url(AUTHORIZATION_URL)
    request.session["oauth_state"] = state
    return RedirectResponse(uri)


@router.get("/google/callback")
async def google_callback(request: Request, code: str, state: str):
    saved_state = request.session.pop("oauth_state", None)
    if not saved_state or saved_state != state:
        return RedirectResponse(f"{APP_BASE_URL}/?auth_error=state_mismatch")

    client = AsyncOAuth2Client(
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        state=saved_state,
    )
    await client.fetch_token(TOKEN_URL, code=code)
    resp = await client.get(USERINFO_URL)
    info = resp.json()

    google_id = info.get("sub")
    email = info.get("email", "")
    name = info.get("name", email.split("@")[0])
    picture = info.get("picture")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.google_id == google_id).first()
        if user:
            user.name = name
            user.picture = picture
        else:
            user = User(google_id=google_id, email=email, name=name, picture=picture)
            db.add(user)
        db.commit()
        db.refresh(user)
        token = create_user_token(user.id, user.email)
    finally:
        db.close()

    return RedirectResponse(f"{APP_BASE_URL}/app?token={token}")


@router.get("/me", response_model=UserOut)
async def me(token_data: dict = Depends(verify_user_token)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == int(token_data["sub"])).first()
        if not user:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return user
    finally:
        db.close()


@router.put("/profile", response_model=UserOut)
async def update_profile(body: UserProfileUpdate, token_data: dict = Depends(verify_user_token)):
    from fastapi import HTTPException
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == int(token_data["sub"])).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        user.name = body.name.strip()
        user.document_id = body.document_id.strip() if body.document_id else None
        user.phone = body.phone.strip() if body.phone else None
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()
