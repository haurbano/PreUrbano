import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from database import engine, Base
from routers import subscribe, admin
from routers import auth as auth_router
from routers import questions as questions_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="PreUrbano API", docs_url=None, redoc_url=None)

SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
app.add_middleware(SessionMiddleware, secret_key=SECRET)

origins = os.getenv("CORS_ORIGINS", "https://preurbano.com").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(subscribe.router, prefix="/api")
app.include_router(admin.router, prefix="/admin")
app.include_router(auth_router.router, prefix="/auth")
app.include_router(questions_router.router, prefix="/admin")

# Serve uploaded files (images extracted from PDFs)
_uploads_path = Path("/app/uploads")
_uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_path)), name="uploads")

_student_html_path = Path(__file__).parent / "student.html"


@app.get("/app", response_class=HTMLResponse)
async def student_app():
    return _student_html_path.read_text(encoding="utf-8")
