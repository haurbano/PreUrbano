import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import subscribe, admin

Base.metadata.create_all(bind=engine)

app = FastAPI(title="PreUrbano API", docs_url=None, redoc_url=None)

origins = os.getenv("CORS_ORIGINS", "https://preurbano.com").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(subscribe.router, prefix="/api")
app.include_router(admin.router, prefix="/admin")
