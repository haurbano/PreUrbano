# PreUrbano — Plan de Mejoras Pendientes

Generado: 2026-05-04. Ver commits de F1 y F2 para el historial de cambios ya aplicados.

---

## ~~F2 — Fix N+1 en admin students + paginación de endpoints~~ ✅ Completada 2026-05-04

**Objetivo:** Evitar congelamiento del panel admin cuando haya >50 estudiantes.

**Archivos:** `backend/routers/admin.py`, `backend/static/admin/users.js`, `backend/static/admin/subscribers.js`, `backend/static/admin/students.js`, `backend/schemas.py`

### Cambios

1. **`list_students` en `admin.py:160-201`** — reemplazar el loop con N+1 queries por una sola query:
   ```python
   # Traer todos los SimulationResult de los user_ids en una sola query
   user_ids = [u.id for u in users]
   all_results = (
       db.query(SimulationResult)
       .filter(SimulationResult.user_id.in_(user_ids))
       .order_by(SimulationResult.created_at.desc())
       .all()
   )
   # Agrupar en Python por user_id, cap de 10 por usuario
   from itertools import groupby
   results_by_user: dict[int, list] = {}
   for r in all_results:
       bucket = results_by_user.setdefault(r.user_id, [])
       if len(bucket) < 10:
           bucket.append(r)
   ```

2. **Paginar `/admin/subscribers` y `/admin/users`** — ambos endpoints devuelven `.all()` sin límite. Agregar `page` y `page_size` params y actualizar el frontend (users.js, subscribers.js) para consumir el formato paginado `{items, total, page, page_size, pages}` que ya usa `/admin/simulations`.

---

## ~~F3 — Helpers backend: scoring, fetch-simulacro, validación de archivos~~ ✅ Completada 2026-05-04

**Objetivo:** Eliminar código duplicado en routers.

**Archivos:** `backend/utils/scoring.py` (nuevo), `backend/routers/simulations.py`, `backend/routers/simulacros_student.py`, `backend/routers/simulacros_admin.py`, `backend/routers/admin.py`, `backend/routers/questions.py`

### Cambios

1. **Crear `backend/utils/scoring.py`** con:
   ```python
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
   ```
   Reemplazar las 4 implementaciones en: `simulations.py:138-153`, `simulacros_student.py:134-146`, `simulacros_admin.py:186`, `admin.py:180`.

2. **Helper `_get_simulacro_or_404(sim_id, db)` en `simulacros_admin.py`** — reemplazar las 6 occurrencias de fetch + 404.

3. **Helper `_validate_image_upload(file) -> bytes` en `questions.py`** — centraliza la validación duplicada en `create_question` y `replace_question_image`.

---

## ~~F4 — DI con `Depends(get_db)` en `routers/auth.py`~~ ✅ Completada 2026-05-04

**Objetivo:** Evitar fugas de conexiones y usar el patrón estándar del proyecto.

**Archivos:** `backend/routers/auth.py`, `backend/routers/admin.py`

### Cambios

1. En `routers/auth.py`, funciones `me` y `update_profile`:
   - Reemplazar `db = SessionLocal(); try/finally db.close()` por `db: Session = Depends(get_db)`.
   - `google_callback` conserva `SessionLocal()` pero dentro de `with SessionLocal() as db:` para garantizar cierre.

2. En `update_profile`, agregar `if not user or user.is_deleted:` (igual que en `me`).

3. En `admin.py:63`, `update_user`: agregar `User.is_deleted == False` en el filtro (backlog ítem).

---

## ~~F5 — `EmailStr` y deduplicación de schemas~~ ✅ Completada 2026-05-04

**Objetivo:** Usar validación estándar de Pydantic y eliminar schemas casi idénticos.

**Archivos:** `backend/schemas.py`, `backend/requirements.txt`, `backend/routers/admin.py`, `backend/routers/simulations.py`

### Cambios

1. **`email-validator`** en `requirements.txt` (permite usar `EmailStr`).

2. **`SubscribeRequest.email`** en `schemas.py`: cambiar `str` por `EmailStr`. Mantener normalización lowercase con validator `mode="before"`.

3. **Deduplicar `StudentSimulationSummary` ≈ `SimulationSummary`**: usar `SimulationSummary` con campos opcionales `timed_out: bool = False` y `duration_seconds: int | None = None`. Actualizar imports en `admin.py` y `simulations.py`.

4. **Agregar `max_length`** a `name`, `document_id`, `phone`, `grade`, `institution` en `UserProfileUpdate` (backlog ítem).

---

## F6 — Frontend: centralizar SUBJECT_LABELS/COLORS y URLs en `shared.js`

**Objetivo:** Una sola fuente de verdad para constantes del frontend.

**Archivos:** `backend/static/admin/shared.js`, `backend/static/admin/users.js`, `backend/static/admin/students.js`, `backend/static/admin/simulacros.js`, `backend/static/admin/questions.js`, `backend/static/admin/app.js`, `backend/admin.html`

### Cambios

1. **Extender `shared.js`**:
   ```js
   export const SUBJECT_LABELS_SHORT = {
     matematicas: 'Mate', ciencias_naturales: 'Ciencias',
     lectura_critica: 'Lectura', sociales: 'Sociales', ingles: 'Inglés',
   };

   export const SUBJECT_COLORS = {
     matematicas: '#a59dff', ciencias_naturales: '#34d399',
     lectura_critica: '#60a5fa', sociales: '#fb923c', ingles: '#f472b6',
   };

   // ⚠️ El admin corre en admin.preurbano.com donde el tunnel no enruta /uploads/
   // correctamente. Por eso se necesita la URL absoluta. No cambiar a ruta relativa.
   export function getUploadsBase() {
     return location.hostname === 'admin.preurbano.com'
       ? 'https://preurbano.com'
       : '';
   }
   export const uploadUrl = (path) => `${getUploadsBase()}/uploads/${path}`;
   ```

2. **Eliminar copias locales** de `SUBJECT_LABELS`, `SUBJECT_LABELS_SHORT`, `SUBJECT_COLORS` en `users.js`, `students.js`, `simulacros.js`. Importar de `shared.js`.

3. **Reemplazar URLs hardcodeadas** en `questions.js` (líneas 101, 246, 410) por `uploadUrl(path)`.

4. **Estandarizar `alert()` → `showToast()`** en `questions.js` para errores (mantener `confirm()` para acciones destructivas).

5. **Actualizar `?v=` de todos los archivos modificados** en `admin.html` y `app.js`.

---

## ~~F7 — nginx: `Cache-Control immutable` en `/static/`~~ ✅ Completada 2026-05-04

**Objetivo:** Aprovechar el `?v=N` existente para cachear agresivamente los assets estáticos.

**Archivos:** `nginx.conf`, `backend/admin.html`

### Cambios

1. En `nginx.conf`, bloque `location ^~ /static/`:
   ```nginx
   add_header Cache-Control "public, max-age=31536000, immutable";
   ```
   Reemplaza el `no-cache` actual.

2. En `admin.html`, `base.css` no tiene `?v=` — agregar `?v=2`.

3. **Verificar antes del deploy**: que TODOS los `<link>` y `<script>` en los HTMLs tienen `?v=N`. Si alguno no lo tiene, agregar el parámetro antes de aplicar `immutable`.

---

## ~~F8 — `backend/.dockerignore`~~ ✅ Completada 2026-05-04

**Objetivo:** Evitar que el build de Docker copie archivos innecesarios.

**Archivos:** `backend/.dockerignore` (nuevo)

### Contenido

```
__pycache__/
*.pyc
*.pyo
.git/
.gitignore
data/
uploads/
.env
.env.example
.pytest_cache/
.venv/
venv/
*.sqlite
```

---

## ~~F9 (opcional) — Migrar `student.js` a `type="module"`~~ ✅ Completada 2026-05-04

**Objetivo:** Consistencia con el frontend de admin que ya usa ES modules.

**Archivos:** `backend/student.html`, `backend/static/student/student.js`

### Cambios

1. En `student.html`, cambiar:
   ```html
   <script src="/static/student/student.js?v=18" defer></script>
   ```
   por:
   ```html
   <script type="module" src="/static/student/student.js?v=19"></script>
   ```

2. En `student.js`, al final del archivo, añadir `Object.assign(window, {...})` con todas las funciones que los `onclick` inline necesitan. Igual al patrón de `app.js`.

3. **No** splitear `student.js` en módulos menores — riesgo alto sin tests. Solo el cambio de tipo de script.

---

## Seguridad pendiente (del BACKLOG original)

Estos ítems están en `BACKLOG.md` y no entran en las fases anteriores:

- [ ] **F-SEC-1:** Derivar extensión de archivo desde `content-type`, no del nombre — `routers/questions.py:42`
- [ ] **F-SEC-2:** Separar `SESSION_SECRET` de `JWT_SECRET` — `main.py:37`
- [ ] **F-SEC-3:** Unificar mensajes de error para evitar enumeración de usuarios — `routers/auth.py`
- [ ] **F-SEC-4:** Headers de seguridad nginx: `HSTS`, `CSP`, `X-XSS-Protection` — `nginx.conf`
- [ ] **F-SEC-5:** TTL para state de OAuth (anti-replay en callback) — `routers/auth.py:36`
- [ ] **F-SEC-6:** Límite superior en paginación de preguntas — `routers/questions.py:70`
- [ ] **F-SEC-7:** Logging de eventos de seguridad (login fallido, token inválido, uploads)

---

## Decisiones de NO hacer

Estas mejoras se descartaron deliberadamente para este proyecto:

- **NO Redis** para sesiones → `TTLDict` en memoria es suficiente para un servidor
- **NO Alembic** → una sola migración existente (ya corrió), `try/except` en startup es aceptable
- **NO unificar** `verify_token` y `verify_user_token_cookie` → son auth schemes ortogonales
- **NO refactorizar** `student.js` en módulos → riesgo alto sin tests automatizados
- **NO consolidar** los `:root` de `student.css`/`landing.css`/`base.css` → cada SPA tiene paleta intencional
- **NO mover `/uploads/` a CDN** → bind mount + StaticFiles funciona, limitación del tunnel admin ya está resuelta con URLs absolutas
