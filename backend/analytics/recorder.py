from datetime import datetime
from sqlalchemy import text
from sqlalchemy.orm import Session


def record_attempts(db: Session, question_results: list[tuple[int, bool]]) -> None:
    """Upsert per-question attempt counters. One transaction per submit call."""
    if not question_results:
        return
    now = datetime.utcnow()
    for qid, was_correct in question_results:
        db.execute(
            text(
                "INSERT INTO question_stats (question_id, total_attempts, correct_attempts, last_updated) "
                "VALUES (:qid, 1, :correct, :now) "
                "ON CONFLICT(question_id) DO UPDATE SET "
                "total_attempts = total_attempts + 1, "
                "correct_attempts = correct_attempts + excluded.correct_attempts, "
                "last_updated = :now"
            ),
            {"qid": qid, "correct": int(was_correct), "now": now},
        )
    db.commit()
