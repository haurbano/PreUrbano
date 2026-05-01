from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

ANALYTICS_DB_URL = "sqlite:////app/data/analytics.sqlite"

engine = create_engine(ANALYTICS_DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
