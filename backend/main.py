import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import text
from database import engine, Base
from routers import admin
from routers import auth as auth_router
from routers import questions as questions_router
from routers import simulations as sim_router
from routers import simulacros_admin as simulacros_admin_router
from routers import simulacros_student as simulacros_student_router
from routers import logs as logs_router
from routers import analytics as analytics_router
import analytics.models  # noqa: F401 — registers models with analytics Base
from analytics.database import engine as analytics_engine, Base as AnalyticsBase

Base.metadata.create_all(bind=engine)
AnalyticsBase.metadata.create_all(bind=analytics_engine)

with engine.connect() as _conn:
    try:
        _conn.execute(text(
            "ALTER TABLE questions ADD COLUMN group_id INTEGER REFERENCES question_groups(id)"
        ))
        _conn.commit()
    except Exception:
        pass  # column already exists

app = FastAPI(title="PreUrbano API", docs_url=None, redoc_url=None)

SECRET = os.getenv("JWT_SECRET")
if not SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")

SESSION_SECRET = os.getenv("SESSION_SECRET")
if not SESSION_SECRET:
    raise RuntimeError("SESSION_SECRET environment variable is required")
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

origins = os.getenv("CORS_ORIGINS", "https://preurbano.com").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(admin.router, prefix="/admin")
app.include_router(auth_router.router, prefix="/auth")
app.include_router(questions_router.router, prefix="/admin")
app.include_router(sim_router.router, prefix="/api")
app.include_router(simulacros_admin_router.router, prefix="/admin")
app.include_router(simulacros_student_router.router, prefix="/api")
app.include_router(logs_router.router, prefix="/api")
app.include_router(analytics_router.router, prefix="/admin")

# Serve uploaded files (images extracted from PDFs)
_uploads_path = Path("/app/uploads")
_uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_path)), name="uploads")

# Serve split CSS/JS assets for admin and student SPAs
_static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_static_path)), name="static")

_student_html_path = Path(__file__).parent / "student.html"


@app.get("/app", response_class=FileResponse)
async def student_app():
    return FileResponse(_student_html_path, media_type="text/html")
