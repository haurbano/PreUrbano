import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from database import engine, Base
from routers import subscribe, admin
from routers import auth as auth_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="PreUrbano API", docs_url=None, redoc_url=None)

SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
app.add_middleware(SessionMiddleware, secret_key=SECRET)

origins = os.getenv("CORS_ORIGINS", "https://preurbano.com").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(subscribe.router, prefix="/api")
app.include_router(admin.router, prefix="/admin")
app.include_router(auth_router.router, prefix="/auth/google")


_student_html_path = Path(__file__).parent / "student.html"


@app.get("/app", response_class=HTMLResponse)
async def student_app():
    return _student_html_path.read_text(encoding="utf-8")
