from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import get_db
from schemas import SubjectDifficultyOut, QuestionWithStats
from auth import verify_token

router = APIRouter()

_SUBJECTS_SQL = """
SELECT q.subject,
       COALESCE(SUM(s.total_attempts), 0) AS attempts,
       COALESCE(SUM(s.correct_attempts), 0) AS correct,
       CASE WHEN SUM(s.total_attempts) > 0
            THEN CAST(ROUND(100.0 * SUM(s.correct_attempts) / SUM(s.total_attempts)) AS INT)
            ELSE NULL END AS accuracy_pct,
       COUNT(q.id) AS question_count
FROM questions q
LEFT JOIN analytics.question_stats s ON s.question_id = q.id
GROUP BY q.subject
ORDER BY accuracy_pct ASC NULLS LAST, q.subject
"""

_HARDEST_SQL = """
SELECT q.id, q.subject, q.correct_option, q.image_path, q.group_id, q.created_at,
       s.total_attempts, s.correct_attempts,
       CAST(ROUND(100.0 * s.correct_attempts / s.total_attempts) AS INT) AS accuracy_pct
FROM questions q
JOIN analytics.question_stats s ON s.question_id = q.id
WHERE s.total_attempts >= :min_attempts
ORDER BY accuracy_pct ASC, s.total_attempts DESC
LIMIT :limit
"""


@router.get("/analytics/subjects", response_model=list[SubjectDifficultyOut])
def subjects_ranking(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    rows = db.execute(text(_SUBJECTS_SQL)).mappings().all()
    return [
        SubjectDifficultyOut(
            subject=r["subject"],
            attempts=r["attempts"],
            correct=r["correct"],
            accuracy_pct=r["accuracy_pct"],
            question_count=r["question_count"],
        )
        for r in rows
    ]


@router.get("/analytics/hardest-questions", response_model=list[QuestionWithStats])
def hardest_questions(
    min_attempts: int = Query(5, ge=1, le=1000),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    rows = db.execute(
        text(_HARDEST_SQL),
        {"min_attempts": min_attempts, "limit": limit},
    ).mappings().all()
    return [
        QuestionWithStats(
            id=r["id"],
            subject=r["subject"],
            correct_option=r["correct_option"],
            image_path=r["image_path"],
            group_id=r["group_id"],
            created_at=r["created_at"],
            attempts=r["total_attempts"],
            correct_count=r["correct_attempts"],
            accuracy_pct=r["accuracy_pct"],
        )
        for r in rows
    ]
