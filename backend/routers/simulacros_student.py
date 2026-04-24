import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Simulacro, SimulacroQuestion, SimulacroResult, Question
from schemas import (
    SimulacroAvailable, SimulacroStartOut, SimulacroSubmitIn, SimulacroSubmitOut,
    QuestionForSim,
)
from auth import verify_user_token_cookie

router = APIRouter()

_active_sim_sessions: dict[str, dict] = {}


@router.get("/simulacro/active", response_model=SimulacroAvailable)
def get_active_simulacro(
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    user_id = int(token_data["sub"])
    sim = db.query(Simulacro).filter(Simulacro.is_active == True).first()
    if not sim:
        return SimulacroAvailable(available=False, already_taken=False)

    question_count = db.query(SimulacroQuestion).filter(
        SimulacroQuestion.simulacro_id == sim.id
    ).count()

    result = db.query(SimulacroResult).filter(
        SimulacroResult.simulacro_id == sim.id,
        SimulacroResult.user_id == user_id,
    ).first()

    if result:
        score = round((result.correct_answers / result.total_questions) * 100) if result.total_questions else 0
        last_result = SimulacroSubmitOut(
            score=score,
            total=result.total_questions,
            correct=result.correct_answers,
            incorrect=result.total_questions - result.correct_answers,
            breakdown=result.breakdown or {},
            timed_out=result.timed_out,
        )
        return SimulacroAvailable(
            available=False, already_taken=True,
            simulacro_id=sim.id, name=sim.name,
            question_count=question_count,
            time_limit_minutes=sim.time_limit_minutes,
            last_result=last_result,
        )

    return SimulacroAvailable(
        available=True, already_taken=False,
        simulacro_id=sim.id, name=sim.name,
        question_count=question_count,
        time_limit_minutes=sim.time_limit_minutes,
    )


@router.post("/simulacro/start", response_model=SimulacroStartOut)
def start_simulacro(
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    user_id = int(token_data["sub"])
    sim = db.query(Simulacro).filter(Simulacro.is_active == True).first()
    if not sim:
        raise HTTPException(status_code=404, detail="No hay simulacro activo.")

    exists = db.query(SimulacroResult).filter(
        SimulacroResult.simulacro_id == sim.id,
        SimulacroResult.user_id == user_id,
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="Ya rendiste este simulacro.")

    sq_rows = (
        db.query(SimulacroQuestion)
        .filter(SimulacroQuestion.simulacro_id == sim.id)
        .order_by(SimulacroQuestion.order)
        .all()
    )
    qids = [sq.question_id for sq in sq_rows]
    qs_map = {q.id: q for q in db.query(Question).filter(Question.id.in_(qids)).all()}
    questions = [
        QuestionForSim(
            id=qs_map[qid].id,
            subject=qs_map[qid].subject,
            image_path=qs_map[qid].image_path,
            correct_option=qs_map[qid].correct_option,
            group_id=qs_map[qid].group_id,
        )
        for qid in qids if qid in qs_map
    ]
    seen: dict[str, int] = {}
    for i, q in enumerate(questions):
        if q.subject not in seen:
            seen[q.subject] = i
    questions.sort(key=lambda q: seen[q.subject])

    session_id = str(uuid.uuid4())
    _active_sim_sessions[session_id] = {
        "simulacro_id": sim.id,
        "user_id": user_id,
        "questions": [
            {"id": q.id, "subject": q.subject, "correct_option": q.correct_option}
            for q in questions
        ],
    }

    return SimulacroStartOut(
        simulacro_id=sim.id,
        session_id=session_id,
        name=sim.name,
        questions=questions,
        time_limit_minutes=sim.time_limit_minutes,
    )


@router.post("/simulacro/submit", response_model=SimulacroSubmitOut)
def submit_simulacro(
    body: SimulacroSubmitIn,
    token_data: dict = Depends(verify_user_token_cookie),
    db: Session = Depends(get_db),
):
    user_id = int(token_data["sub"])
    session = _active_sim_sessions.pop(body.session_id, None)
    if not session or session["user_id"] != user_id or session["simulacro_id"] != body.simulacro_id:
        raise HTTPException(status_code=400, detail="Sesión inválida.")

    answers_map = {a["question_id"]: a["selected_option"] for a in body.answers}
    correct = 0
    breakdown: dict = {}
    for q in session["questions"]:
        subject = q["subject"]
        if subject not in breakdown:
            breakdown[subject] = {"correct": 0, "total": 0}
        breakdown[subject]["total"] += 1
        if answers_map.get(q["id"]) == q["correct_option"]:
            correct += 1
            breakdown[subject]["correct"] += 1

    total = len(session["questions"])
    score = round((correct / total) * 100) if total > 0 else 0

    try:
        result = SimulacroResult(
            simulacro_id=body.simulacro_id,
            user_id=user_id,
            total_questions=total,
            correct_answers=correct,
            breakdown=breakdown,
            timed_out=body.timed_out,
        )
        db.add(result)
        db.commit()
    except Exception:
        db.rollback()
        existing = db.query(SimulacroResult).filter(
            SimulacroResult.simulacro_id == body.simulacro_id,
            SimulacroResult.user_id == user_id,
        ).first()
        if existing:
            existing_score = round((existing.correct_answers / existing.total_questions) * 100) if existing.total_questions else 0
            return SimulacroSubmitOut(
                score=existing_score, total=existing.total_questions,
                correct=existing.correct_answers,
                incorrect=existing.total_questions - existing.correct_answers,
                breakdown=existing.breakdown or {},
                timed_out=existing.timed_out,
            )
        raise

    return SimulacroSubmitOut(
        score=score, total=total, correct=correct,
        incorrect=total - correct, breakdown=breakdown,
        timed_out=body.timed_out,
    )
