import uuid
import random
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from analytics.database import get_db as analytics_get_db
from analytics.recorder import record_attempts
from models import Question, SimulationConfig, SimulationResult, DEFAULT_CONFIG
from schemas import (
    SimulationStartOut,
    SimulationSubmitIn,
    SimulationSubmitOut,
    QuestionForSim,
    StudentProgressOut,
    SimulationStartIn,
)
from auth import verify_user_token_cookie
from utils.session_store import TTLDict
from utils.scoring import score_pct, compute_breakdown

router = APIRouter()

_active_simulations: TTLDict = TTLDict()

SUBJECTS = ["matematicas", "ciencias_naturales", "lectura_critica", "sociales", "ingles"]


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

    selected = [s for s in SUBJECTS if s in subjects]
    random.shuffle(selected)

    all_questions = []
    for subject in selected:
        subject_qs = db.query(Question).filter(Question.subject == subject).all()

        groups: dict[int, list] = {}
        solo: list = []
        for q in subject_qs:
            if q.group_id is not None:
                groups.setdefault(q.group_id, []).append(q)
            else:
                solo.append(q)

        units = list(groups.values()) + [[q] for q in solo]
        random.shuffle(units)

        subject_selected: list = []
        for unit in units:
            if len(subject_selected) >= total_target:
                break
            subject_selected.extend(unit)

        all_questions.extend(subject_selected)

    if not all_questions:
        return SimulationStartOut(
            simulation_id="",
            questions=[],
            total_available=0,
            warning="No hay preguntas disponibles.",
        )
    total_available = len(all_questions)
    warning = None
    expected_total = total_target * len(subjects)
    if total_available < expected_total:
        warning = f"Solo hay {total_available} preguntas disponibles."

    questions_out = [
        QuestionForSim(id=q.id, subject=q.subject, image_path=q.image_path, correct_option=q.correct_option, group_id=q.group_id)
        for q in all_questions
    ]

    sim_id = str(uuid.uuid4())
    _active_simulations.set(sim_id, [
        {"id": q.id, "subject": q.subject, "correct_option": q.correct_option}
        for q in all_questions
    ])

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
    analytics_db: Session = Depends(analytics_get_db),
):
    sim_id = body.simulation_id
    questions_data = _active_simulations.pop(sim_id, None)
    if not questions_data:
        return SimulationSubmitOut(score=0, total=0, correct=0, incorrect=0, breakdown={})

    answers_map = {a["question_id"]: a["selected_option"] for a in body.answers}
    correct, breakdown = compute_breakdown(questions_data, answers_map)
    total = len(questions_data)
    incorrect = total - correct
    score = score_pct(correct, total)

    question_results = [
        (q["id"], answers_map.get(q["id"]) == q["correct_option"])
        for q in questions_data
    ]
    record_attempts(analytics_db, question_results)

    user_id = int(token_data["sub"])
    result = SimulationResult(
        user_id=user_id,
        total_questions=total,
        correct_answers=correct,
        breakdown=breakdown,
        timed_out=body.timed_out,
        duration_seconds=body.duration_seconds,
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
        simulations.append({
            "id": r.id,
            "created_at": r.created_at,
            "total_questions": r.total_questions,
            "correct_answers": r.correct_answers,
            "incorrect_answers": r.total_questions - r.correct_answers,
            "score_pct": score_pct(r.correct_answers, r.total_questions),
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
