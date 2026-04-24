import uuid
import random
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Question, SimulationConfig, SimulationResult
from schemas import (
    SimulationStartOut,
    SimulationSubmitIn,
    SimulationSubmitOut,
    QuestionForSim,
    StudentProgressOut,
    SimulationStartIn,
)
from auth import verify_user_token_cookie

router = APIRouter()

_active_simulations: dict[str, list[dict]] = {}

SUBJECTS = ["matematicas", "ciencias_naturales", "lectura_critica", "sociales", "ingles"]

DEFAULT_CONFIG = {
    "questions_per_simulation": 20,
    "subject_limits": {
        "matematicas": 4,
        "ciencias_naturales": 4,
        "lectura_critica": 4,
        "sociales": 4,
        "ingles": 4,
    },
}


@router.get("/simulation/subjects")
def get_available_subjects(
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    rows = db.query(Question.subject).distinct().all()
    available = {r[0] for r in rows}
    return {"subjects": [s for s in SUBJECTS if s in available]}


@router.post("/simulation/start", response_model=SimulationStartOut)
def start_simulation(
    body: SimulationStartIn | None = None,
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    config = db.query(SimulationConfig).filter(SimulationConfig.id == 1).first()
    if not config:
        config = SimulationConfig(
            id=1,
            questions_per_simulation=DEFAULT_CONFIG["questions_per_simulation"],
            subject_limits=DEFAULT_CONFIG["subject_limits"],
            time_limit_minutes=0,
        )
        db.add(config)
        db.commit()
        db.refresh(config)

    subjects = body.subjects if body and body.subjects else SUBJECTS
    total_target = body.total_questions if body and body.total_questions else config.questions_per_simulation

    all_questions = []
    for subject in SUBJECTS:
        if subject not in subjects:
            continue
        subject_qs = db.query(Question).filter(Question.subject == subject).all()
        random.shuffle(subject_qs)
        all_questions.extend(subject_qs[:total_target])

    if not all_questions:
        return SimulationStartOut(
            simulation_id="",
            questions=[],
            total_available=0,
            warning="No hay preguntas disponibles.",
        )

    random.shuffle(all_questions)
    total_available = len(all_questions)
    warning = None
    expected_total = total_target * len(subjects)
    if total_available < expected_total:
        warning = f"Solo hay {total_available} preguntas disponibles."

    questions_out = [
        QuestionForSim(id=q.id, subject=q.subject, image_path=q.image_path, correct_option=q.correct_option)
        for q in all_questions
    ]

    sim_id = str(uuid.uuid4())
    _active_simulations[sim_id] = [
        {"id": q.id, "subject": q.subject, "correct_option": q.correct_option}
        for q in all_questions
    ]

    return SimulationStartOut(
        simulation_id=sim_id,
        questions=questions_out,
        total_available=total_available,
        warning=warning,
        time_limit_minutes=config.time_limit_minutes,
    )


@router.post("/simulation/submit", response_model=SimulationSubmitOut)
def submit_simulation(
    body: SimulationSubmitIn,
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    sim_id = body.simulation_id
    questions_data = _active_simulations.pop(sim_id, None)
    if not questions_data:
        return SimulationSubmitOut(score=0, total=0, correct=0, incorrect=0, breakdown={})

    answers_map = {a["question_id"]: a["selected_option"] for a in body.answers}

    correct = 0
    breakdown: dict[str, dict[str, int]] = {}
    for q in questions_data:
        subject = q["subject"]
        if subject not in breakdown:
            breakdown[subject] = {"correct": 0, "total": 0}
        breakdown[subject]["total"] += 1

        selected = answers_map.get(q["id"])
        if selected == q["correct_option"]:
            correct += 1
            breakdown[subject]["correct"] += 1

    total = len(questions_data)
    incorrect = total - correct
    score = round((correct / total) * 100) if total > 0 else 0

    user_id = int(token_data["sub"])
    result = SimulationResult(
        user_id=user_id,
        total_questions=total,
        correct_answers=correct,
        breakdown=breakdown,
        timed_out=body.timed_out,
    )
    db.add(result)
    db.commit()

    user_results = db.query(SimulationResult).filter(
        SimulationResult.user_id == user_id
    ).order_by(SimulationResult.created_at.desc()).all()
    if len(user_results) > 10:
        for r in user_results[10:]:
            db.delete(r)
        db.commit()

    return SimulationSubmitOut(
        score=score,
        total=total,
        correct=correct,
        incorrect=incorrect,
        breakdown=breakdown,
        timed_out=body.timed_out,
    )


@router.get("/student/progress", response_model=StudentProgressOut)
def get_student_progress(
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    user_id = int(token_data["sub"])
    results = (
        db.query(SimulationResult)
        .filter(SimulationResult.user_id == user_id)
        .order_by(SimulationResult.created_at.desc())
        .limit(10)
        .all()
    )

    total_questions = 0
    total_correct = 0
    by_subject: dict[str, dict[str, int]] = {}
    simulations = []

    for r in results:
        total_questions += r.total_questions
        total_correct += r.correct_answers
        for subject, bd in (r.breakdown or {}).items():
            agg = by_subject.setdefault(subject, {"correct": 0, "total": 0})
            agg["correct"] += bd.get("correct", 0)
            agg["total"] += bd.get("total", 0)
        score_pct = round((r.correct_answers / r.total_questions) * 100) if r.total_questions else 0
        simulations.append({
            "id": r.id,
            "created_at": r.created_at,
            "total_questions": r.total_questions,
            "correct_answers": r.correct_answers,
            "incorrect_answers": r.total_questions - r.correct_answers,
            "score_pct": score_pct,
            "breakdown": r.breakdown or {},
        })

    return StudentProgressOut(
        total_simulations=len(results),
        total_questions=total_questions,
        total_correct=total_correct,
        total_incorrect=total_questions - total_correct,
        by_subject=by_subject,
        simulations=simulations,
    )
