import os
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from authlib.integrations.httpx_client import AsyncOAuth2Client
from database import SessionLocal, get_db
from models import User
from auth import create_user_token, verify_user_token_cookie
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

    # google_callback cannot use Depends(get_db) — it's not a protected route
    # and needs manual session management for the OAuth flow.
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.google_id == google_id).first()
        if user:
            if user.is_deleted:
                return RedirectResponse(f"{APP_BASE_URL}/?auth_error=account_deleted")
            user.name = name
            user.picture = picture
        else:
            user = User(google_id=google_id, email=email, name=name, picture=picture, is_active=False)
            db.add(user)
        db.commit()
        db.refresh(user)
        token = create_user_token(user.id, user.email)
    finally:
        db.close()

    response = RedirectResponse(f"{APP_BASE_URL}/app")
    response.set_cookie(
        key="pu_auth",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=8 * 3600,
        path="/",
    )
    return response


@router.get("/logout")
async def logout():
    response = RedirectResponse("/")
    response.delete_cookie(key="pu_auth", path="/")
    return response


@router.get("/me", response_model=UserOut)
async def me(
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == int(token_data["sub"])).first()
    if not user or user.is_deleted:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


@router.put("/profile", response_model=UserOut)
async def update_profile(
    body: UserProfileUpdate,
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.id == int(token_data["sub"]),
        User.is_deleted == False,
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    user.name = body.name.strip()
    user.document_id = body.document_id.strip() if body.document_id else None
    user.phone = body.phone.strip() if body.phone else None
    user.grade = body.grade.strip() if body.grade else None
    user.institution = body.institution.strip() if body.institution else None
    db.commit()
    db.refresh(user)
    return user
