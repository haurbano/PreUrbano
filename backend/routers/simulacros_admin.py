from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Simulacro, SimulacroQuestion, SimulacroResult, Question, User
from schemas import (
    SimulacroCreate, SimulacroUpdate, SimulacroSummary, SimulacroDetail,
    SimulacroResultAdminRow, SimulacroResultsAdminOut, QuestionOut,
)
from auth import verify_token
from utils.scoring import score_pct

router = APIRouter()


def _get_simulacro_or_404(sim_id: int, db: Session) -> Simulacro:
    sim = db.query(Simulacro).filter(Simulacro.id == sim_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulacro no encontrado.")
    return sim


def _build_summary(sim: Simulacro, db: Session) -> SimulacroSummary:
    qc = db.query(func.count(SimulacroQuestion.id)).filter(
        SimulacroQuestion.simulacro_id == sim.id
    ).scalar() or 0
    ac = db.query(func.count(SimulacroResult.id)).filter(
        SimulacroResult.simulacro_id == sim.id
    ).scalar() or 0
    return SimulacroSummary(
        id=sim.id, name=sim.name, is_active=sim.is_active,
        time_limit_minutes=sim.time_limit_minutes,
        question_count=qc, attempts_count=ac, created_at=sim.created_at,
    )


def _build_detail(sim: Simulacro, db: Session) -> SimulacroDetail:
    summary = _build_summary(sim, db)
    sq_rows = (
        db.query(SimulacroQuestion)
        .filter(SimulacroQuestion.simulacro_id == sim.id)
        .order_by(SimulacroQuestion.order)
        .all()
    )
    qids_ordered = [sq.question_id for sq in sq_rows]
    qs_map = {q.id: q for q in db.query(Question).filter(Question.id.in_(qids_ordered)).all()}
    questions = [QuestionOut.model_validate(qs_map[qid]) for qid in qids_ordered if qid in qs_map]
    return SimulacroDetail(**summary.model_dump(), questions=questions)


def _validate_question_ids(question_ids: list[int], db: Session) -> None:
    found = db.query(func.count(Question.id)).filter(Question.id.in_(question_ids)).scalar()
    if found != len(question_ids):
        raise HTTPException(status_code=400, detail="Alguna pregunta no existe.")


@router.post("/simulacros", response_model=SimulacroSummary)
def create_simulacro(
    body: SimulacroCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    if not body.question_ids:
        raise HTTPException(status_code=400, detail="Se requiere al menos una pregunta.")
    _validate_question_ids(body.question_ids, db)

    sim = Simulacro(name=body.name, time_limit_minutes=body.time_limit_minutes)
    db.add(sim)
    db.flush()
    for i, qid in enumerate(body.question_ids):
        db.add(SimulacroQuestion(simulacro_id=sim.id, question_id=qid, order=i))
    db.commit()
    db.refresh(sim)
    return _build_summary(sim, db)


@router.get("/simulacros", response_model=list[SimulacroSummary])
def list_simulacros(
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    sims = (
        db.query(Simulacro)
        .order_by(Simulacro.is_active.desc(), Simulacro.created_at.desc())
        .all()
    )
    return [_build_summary(s, db) for s in sims]


@router.get("/simulacros/{sim_id}", response_model=SimulacroDetail)
def get_simulacro(
    sim_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    sim = _get_simulacro_or_404(sim_id, db)
    return _build_detail(sim, db)


@router.patch("/simulacros/{sim_id}", response_model=SimulacroSummary)
def update_simulacro(
    sim_id: int,
    body: SimulacroUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    sim = _get_simulacro_or_404(sim_id, db)
    if body.name is not None:
        sim.name = body.name
    if body.time_limit_minutes is not None:
        sim.time_limit_minutes = body.time_limit_minutes
    if body.question_ids is not None:
        if not body.question_ids:
            raise HTTPException(status_code=400, detail="Se requiere al menos una pregunta.")
        _validate_question_ids(body.question_ids, db)
        db.query(SimulacroQuestion).filter(SimulacroQuestion.simulacro_id == sim_id).delete()
        for i, qid in enumerate(body.question_ids):
            db.add(SimulacroQuestion(simulacro_id=sim_id, question_id=qid, order=i))
    db.commit()
    db.refresh(sim)
    return _build_summary(sim, db)


@router.post("/simulacros/{sim_id}/activate", response_model=SimulacroSummary)
def activate_simulacro(
    sim_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    sim = _get_simulacro_or_404(sim_id, db)
    db.query(Simulacro).filter(Simulacro.id != sim_id).update({"is_active": False})
    sim.is_active = True
    db.commit()
    db.refresh(sim)
    return _build_summary(sim, db)


@router.post("/simulacros/{sim_id}/deactivate", response_model=SimulacroSummary)
def deactivate_simulacro(
    sim_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    sim = _get_simulacro_or_404(sim_id, db)
    sim.is_active = False
    db.commit()
    db.refresh(sim)
    return _build_summary(sim, db)


@router.delete("/simulacros/{sim_id}", status_code=204)
def delete_simulacro(
    sim_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    sim = _get_simulacro_or_404(sim_id, db)
    if sim.is_active:
        raise HTTPException(status_code=409, detail="Desactiva el simulacro antes de eliminarlo.")
    db.delete(sim)
    db.commit()


@router.get("/simulacros/{sim_id}/results", response_model=SimulacroResultsAdminOut)
def get_simulacro_results(
    sim_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_token),
):
    sim = _get_simulacro_or_404(sim_id, db)
    results = (
        db.query(SimulacroResult)
        .filter(SimulacroResult.simulacro_id == sim_id)
        .order_by(SimulacroResult.created_at.desc())
        .all()
    )
    user_ids = [r.user_id for r in results]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    rows = []
    for r in results:
        u = users.get(r.user_id)
        score = score_pct(r.correct_answers, r.total_questions)
        rows.append(SimulacroResultAdminRow(
            id=r.id,
            user_id=r.user_id,
            user_name=u.name if u else "—",
            user_email=u.email if u else "—",
            score=score,
            total_questions=r.total_questions,
            correct_answers=r.correct_answers,
            timed_out=r.timed_out,
            created_at=r.created_at,
        ))
    return SimulacroResultsAdminOut(items=rows, total=len(rows))
