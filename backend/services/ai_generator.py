import json
import os
import anthropic

SYSTEM_PROMPT = """Eres un generador de preguntas de práctica para el examen ICFES de Colombia.
Analiza el contenido proporcionado y genera preguntas de selección múltiple en formato ICFES.

Reglas:
- Las preguntas deben estar en español
- Cada pregunta tiene exactamente 4 opciones (A, B, C, D) con una única respuesta correcta
- Detecta la materia automáticamente: matematicas, ciencias_naturales, lectura_critica, sociales, o ingles
- Incluye una explicación breve de por qué la respuesta es correcta
- Genera entre 3 y 15 preguntas según la riqueza del contenido
- Los enunciados deben ser claros y autocontenidos

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código:
[{"subject":"matematicas","stem":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"A","explanation":"..."}]"""


def generate_questions(text: str, images_b64: list[str]) -> list[dict]:
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    content: list = []

    # Add images first if present
    for img_b64 in images_b64[:5]:  # cap at 5 images per request
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
        })

    # Add text if present
    if text.strip():
        content.append({"type": "text", "text": text[:12000]})  # token safety cap
    elif not images_b64:
        return []

    if not content:
        return []

    # Add instruction at end
    content.append({
        "type": "text",
        "text": "Genera las preguntas ICFES basadas en el contenido anterior.",
    })

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
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
