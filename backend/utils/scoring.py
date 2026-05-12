def score_pct(correct: int, total: int) -> int:
    return round((correct / total) * 100) if total else 0


def compute_breakdown(questions: list[dict], answers_map: dict[int, str]) -> tuple[int, dict]:
    correct = 0
    breakdown: dict[str, dict[str, int]] = {}
    for q in questions:
        subject = q["subject"]
        if subject not in breakdown:
            breakdown[subject] = {"correct": 0, "total": 0}
        breakdown[subject]["total"] += 1
        if answers_map.get(q["id"]) == q["correct_option"]:
            correct += 1
            breakdown[subject]["correct"] += 1
    return correct, breakdown


def subject_scores(breakdown: dict) -> dict[str, int]:
    return {
        subj: score_pct(bd.get("correct", 0), bd.get("total", 0))
        for subj, bd in breakdown.items()
    }


def total_score(subject_scores_map: dict[str, int]) -> int:
    return sum(subject_scores_map.values())
