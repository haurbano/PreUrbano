import uuid
import random
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Question, SimulationConfig, SimulationResult
from schemas import (
    SimulationStartOut,
    SimulationSubmitIn,
    SimulationSubmitOut,
    QuestionForSim,
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


@router.post("/simulation/start", response_model=SimulationStartOut)
def start_simulation(
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    config = db.query(SimulationConfig).filter(SimulationConfig.id == 1).first()
    if not config:
        config = SimulationConfig(
            id=1,
            questions_per_simulation=DEFAULT_CONFIG["questions_per_simulation"],
            subject_limits=DEFAULT_CONFIG["subject_limits"],
        )
        db.add(config)
        db.commit()
        db.refresh(config)

    limits = config.subject_limits
    total_target = config.questions_per_simulation

    all_questions = []
    for subject in SUBJECTS:
        limit = limits.get(subject, 0)
        if limit > 0:
            subject_qs = (
                db.query(Question)
                .filter(Question.subject == subject)
                .order_by(func.random())
                .limit(limit)
                .all()
            )
            all_questions.extend(subject_qs)

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
    if total_available < total_target:
        warning = f"Solo hay {total_available} preguntas disponibles."

    questions_out = [
        QuestionForSim(id=q.id, subject=q.subject, image_path=q.image_path)
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
    )
    db.add(result)
    db.commit()

    return SimulationSubmitOut(
        score=score,
        total=total,
        correct=correct,
        incorrect=incorrect,
        breakdown=breakdown,
    )
