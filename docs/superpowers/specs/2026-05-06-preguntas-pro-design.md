# Diseño — Preguntas Pro con acceso por estudiante

## Contexto

Hoy todas las preguntas del banco son visibles para todos los estudiantes en la práctica libre (selección aleatoria por materia). El admin necesita poder marcar ciertas preguntas como **"Pro"** y habilitar/deshabilitar el acceso a ese contenido extra para estudiantes específicos. La motivación es ofrecer contenido diferenciado a un subconjunto de estudiantes (becas, plan pago, alumnos avanzados) sin separar el banco en dos.

**Outcome esperado:** un estudiante con acceso Pro ve preguntas Pro mezcladas en su pool de práctica libre; un estudiante sin acceso nunca las ve. Los simulacros (curados por el admin) no filtran — todos los estudiantes ven las preguntas que el admin haya elegido.

## Decisiones tomadas

1. **Modelo:** un solo `Question` con flag `is_pro: bool` (no tabla separada).
2. **Acceso:** flag `has_pro_access: bool` por usuario individual (no grupos, no tiers).
3. **Práctica libre:** mezclada — los Pro entran al pool aleatorio si el estudiante tiene acceso.
4. **Simulacros:** no filtran. Si el admin pone preguntas Pro en un simulacro, todos los que lo tomen las ven.
5. **Admin UX:** el upload se hace en el formulario existente del banco con un checkbox `[ ] Pregunta Pro`. La edición también permite togglear el flag. No hay sidebar nueva.
6. **Estudiante UX:** sin cambios visibles. No hay badge "Pro" ni mensaje. La diferencia es invisible.

## Arquitectura

### Schema (DB)

```sql
ALTER TABLE questions ADD COLUMN is_pro INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN has_pro_access INTEGER NOT NULL DEFAULT 0;
```

SQLite no rehace las tablas con `Base.metadata.create_all()`, así que las columnas hay que agregarlas con `ALTER TABLE ... ADD COLUMN` sobre la DB existente. Defaults `0` (false) garantizan compatibilidad con datos previos.

### Migración

Script `scripts/migrate_pro_feature.sh` idempotente:

```bash
#!/usr/bin/env bash
set -euo pipefail
ssh haurbano@192.168.1.66 "docker exec preurbano-new-backend-1 python3 -c \"
import sqlite3
con = sqlite3.connect('/app/data/db.sqlite')
def add_col(table, col, ddl):
    cols = {r[1] for r in con.execute(f'PRAGMA table_info({table})')}
    if col not in cols:
        con.execute(f'ALTER TABLE {table} ADD COLUMN {ddl}')
        print(f'+ {table}.{col}')
con.execute('BEGIN')
add_col('questions', 'is_pro', 'is_pro INTEGER NOT NULL DEFAULT 0')
add_col('users', 'has_pro_access', 'has_pro_access INTEGER NOT NULL DEFAULT 0')
con.commit()
\""
```

Se corre **antes** del primer deploy con el código nuevo.

### Modelos (SQLAlchemy)

**`backend/models.py`**

```python
class Question(Base):
    # ... campos existentes ...
    is_pro = Column(Boolean, nullable=False, default=False)

class User(Base):
    # ... campos existentes ...
    has_pro_access = Column(Boolean, nullable=False, default=False)
```

### Schemas (Pydantic)

**`backend/schemas.py`**

```python
class QuestionOut(BaseModel):
    # ... campos existentes ...
    is_pro: bool = False

class QuestionUpdate(BaseModel):
    # ... campos existentes ...
    is_pro: bool | None = None  # None + en model_fields_set → no toca

class UserOut(BaseModel):
    # ... campos existentes ...
    has_pro_access: bool = False

class UserUpdate(BaseModel):  # usado por PATCH /admin/users/{id}
    # ... campos existentes ...
    has_pro_access: bool | None = None
```

## Endpoints

### Admin — preguntas

| Endpoint | Cambio |
|---|---|
| `POST /admin/questions` | Multipart agrega campo opcional `is_pro: bool = False`. La pregunta se crea con ese flag. |
| `PATCH /admin/questions/{id}` | Body acepta `is_pro` opcional. Si se envía, se actualiza. |
| `GET /admin/questions` | Query param nuevo `is_pro: bool \| None = None` (default = todas). El listado del bank en el admin lo usa para el filtro "Tipo" (Todas / Solo Pro / Solo regulares). |

### Admin — usuarios

| Endpoint | Cambio |
|---|---|
| `PATCH /admin/users/{id}` | Body acepta `has_pro_access: bool` opcional. |
| `GET /admin/users` | Response incluye `has_pro_access` para renderizar el toggle. |

### Estudiante — práctica libre

`POST /api/simulation/start` (`backend/routers/simulations.py`):

- Leer `user.has_pro_access` desde la sesión autenticada.
- Query del pool aleatorio: si `has_pro_access=False`, agregar `WHERE is_pro = 0`. Si es `True`, sin filtro adicional.
- El resto del flujo (random sample, TTLDict, submit, breakdown) no cambia.

## Frontend (admin)

### Vista del banco

**`backend/admin.html` y `backend/static/admin/questions.js`**:

1. **Formulario de upload nuevo:** agregar checkbox debajo de los selectores de materia y opción correcta:
   ```html
   <label><input type="checkbox" id="new-is-pro"> Pregunta Pro</label>
   ```
   En el submit, agregar `formData.append('is_pro', isProChecked)`.

2. **Tabla del banco:** agregar columna "Pro" entre "Materia" y "Dificultad". Mostrar un badge sutil (ícono ✓ o estilo distintivo) cuando `q.is_pro === true`.

3. **Filtro:** sumar al filtro de materia un dropdown "Tipo" con tres opciones: Todas / Solo Pro / Solo regulares. Cambia → re-fetch con `is_pro=true|false|null`.

4. **Vista de detalle/edición** (`view-question-detail`): junto a los selectores existentes, agregar el mismo checkbox `[ ] Pregunta Pro`. Al guardar, incluir `is_pro` en el payload del PATCH.

### Vista de usuarios

**`backend/static/admin/users.js`**:

Agregar columna "Pro" con un toggle de estilo idéntico al toggle `is_active` ya existente. Click → `PATCH /admin/users/{id}` con `{has_pro_access: true|false}`. Re-fetch del listado al éxito.

### Versioning de assets

Bumpear las versiones en `backend/admin.html`: `questions.js?v=N+1`, `users.js?v=N+1`, `app.js?v=N+1`.

## Frontend (estudiante)

**Sin cambios.** Toda la lógica vive en el backend (filtrado del pool en `simulation/start`).

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `scripts/migrate_pro_feature.sh` | **Nuevo** — migración idempotente |
| `backend/models.py` | `is_pro` en `Question`, `has_pro_access` en `User` |
| `backend/schemas.py` | Campos en `QuestionOut/Update`, `UserOut/Update` |
| `backend/routers/questions.py` | Recibir `is_pro` en POST/PATCH; query param en GET |
| `backend/routers/admin.py` | Recibir `has_pro_access` en PATCH user; incluir en GET |
| `backend/routers/simulations.py` | Filtrar pool por `has_pro_access` en `/simulation/start` |
| `backend/admin.html` | Checkbox upload + columna Pro en tabla + columna toggle Pro en usuarios + filtro tipo + bump versiones |
| `backend/static/admin/questions.js` | Manejar checkbox upload, filtro tipo, columna Pro, edición |
| `backend/static/admin/users.js` | Toggle Pro con PATCH |

## Error handling y edge cases

- **Form upload sin marcar:** `is_pro` ausente → backend default `False`.
- **PATCH sin `is_pro`:** Pydantic `model_fields_set` decide, no se toca.
- **Usuario legacy:** la migración los dejó en `has_pro_access=False`, no ven preguntas Pro.
- **Práctica activa cuando se cambia el flag:** el pool ya fue armado y vive en `_active_simulations` (TTLDict). El cambio aplica recién en la próxima práctica.
- **Pool vacío para no-Pro:** si el admin marcó casi todo como Pro, un estudiante sin acceso podría no tener suficientes preguntas. El endpoint `simulation/start` ya maneja pool vacío hoy (devuelve error/aviso). No requiere cambio.
- **Borrado de pregunta Pro:** sin cambios — el flujo de delete funciona idéntico al regular.

## Testing manual

1. **Migración:** correr `scripts/migrate_pro_feature.sh`; verificar con `PRAGMA table_info(questions)` y `PRAGMA table_info(users)` que las columnas existen.
2. **Upload Pro:** desde admin, marcar checkbox y subir 2-3 preguntas. Verificar badge en la tabla.
3. **Edición:** abrir una pregunta regular, marcar Pro, guardar → debe aparecer con badge.
4. **Filtro:** cambiar dropdown a "Solo Pro" → solo se ven Pro; "Solo regulares" → ninguna Pro.
5. **Toggle usuario:** habilitar Pro al estudiante A, dejar a B sin Pro.
6. **Práctica A:** login como A, hacer 3 prácticas seguidas → debe aparecer al menos alguna Pro.
7. **Práctica B:** login como B, hacer 3 prácticas seguidas → ninguna Pro debería aparecer.
8. **Simulacro:** crear simulacro con preguntas Pro mezcladas; B lo toma → ve todas, incluidas Pro.
9. **Analytics:** verificar que las stats de dificultad por pregunta y la nueva vista de Analítica siguen funcionando para Pro y regulares.
10. **Idempotencia migración:** correr el script una segunda vez → no debe fallar ni duplicar columnas.

## Deploy

```bash
# Una sola vez, antes del deploy del código nuevo:
./scripts/migrate_pro_feature.sh

# Luego deploy normal:
./scripts/deploy.sh --backend
```

## Out of scope (YAGNI)

- Tiers múltiples (Pro / Premium / Enterprise) — un solo nivel es suficiente.
- Grupos de estudiantes — toggle individual cubre el uso actual.
- Storage físico separado de imágenes Pro.
- Badge "Pro" visible al estudiante.
- Endpoint específico para upload Pro (`/admin/pro-questions`) — reutilizamos `/admin/questions`.
- Métricas separadas Pro vs regulares en analytics — la vista de analytics existente sirve igual.
- Notificación al estudiante cuando se le habilita Pro.
