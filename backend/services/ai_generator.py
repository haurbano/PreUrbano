import json
import os
import anthropic

SYSTEM_PROMPT = """Eres un extractor y generador de preguntas de práctica para el examen ICFES de Colombia.

Tu tarea:
1. Si el contenido ya contiene preguntas de selección múltiple, extráelas TODAS sin omitir ninguna.
2. Si el contenido es material de estudio, genera preguntas ICFES a partir de él.

Reglas:
- Las preguntas deben estar en español
- Cada pregunta tiene exactamente 4 opciones (A, B, C, D) con una única respuesta correcta
- Detecta la materia automáticamente: matematicas, ciencias_naturales, lectura_critica, sociales, o ingles
- Incluye una explicación breve de por qué la respuesta es correcta
- NO hay límite de preguntas: extrae o genera TODAS las que encuentres en el contenido
- Los enunciados deben ser claros y autocontenidos

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código:
[{"subject":"matematicas","stem":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"A","explanation":"..."}]"""


def generate_questions(text: str, images_b64: list[str]) -> list[dict]:
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    content: list = []

    for img_b64 in images_b64:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
        })

    if text.strip():
        content.append({"type": "text", "text": text})
    elif not images_b64:
        return []

    if not content:
        return []

    content.append({
        "type": "text",
        "text": "Extrae o genera TODAS las preguntas ICFES del contenido anterior. No omitas ninguna.",
    })

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    raw = response.content[0].text.strip()

    # Strip markdown code blocks if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    questions = json.loads(raw)

    # Normalize and validate
    valid = []
    for q in questions:
        if not all(k in q for k in ("stem", "option_a", "option_b", "option_c", "option_d", "correct_option")):
            continue
        q.setdefault("subject", "lectura_critica")
        q.setdefault("explanation", None)
        q["correct_option"] = q["correct_option"].upper()[:1]
        if q["correct_option"] not in ("A", "B", "C", "D"):
            q["correct_option"] = "A"
        valid.append(q)

    return valid
