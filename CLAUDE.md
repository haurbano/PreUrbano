# PreUrbano — Contexto del proyecto

## Qué es
Landing page de expectativa + plataforma de práctica ICFES gratuita para estudiantes de Colón, Nariño. Actualmente en fase de lista de espera con login de estudiantes y panel admin funcional.

## Stack
- **Frontend:** HTML/CSS/JS vanilla — `index.html` (landing) y `backend/student.html` (app estudiante)
- **Backend:** FastAPI (Python 3.12) — `backend/`
- **DB:** SQLite via SQLAlchemy — `/app/data/db.sqlite` (volume montado)
- **Auth admin:** JWT con contraseña (`ADMIN_PASSWORD`)
- **Auth estudiantes:** Google OAuth2 via `authlib`
- **Infra:** Docker Compose — nginx + FastAPI + cloudflared (Cloudflare Tunnel, sin puertos expuestos)

## Despliegue
- **Servidor:** Ubuntu Docker VM `haurbano@192.168.1.66`
- **Directorio:** `/home/haurbano/preurbano-new/`
- **Sitio público:** https://preurbano.com
- **Panel admin:** https://admin.preurbano.com
- **App estudiante:** https://preurbano.com/app

### Comandos de deploy
```bash
# Cambios en backend (Python, HTML del backend, requirements)
git push origin main
ssh haurbano@192.168.1.66 "cd /home/haurbano/preurbano-new && git pull && docker compose up -d --build backend"

# Cambios solo en index.html (bind mount)
git push origin main
ssh haurbano@192.168.1.66 "cd /home/haurbano/preurbano-new && git pull && docker restart preurbano-new-web-1"

# Cambios en nginx.conf (bind mount)
git push origin main
ssh haurbano@192.168.1.66 "cd /home/haurbano/preurbano-new && git pull && docker restart preurbano-new-web-1"
```

> **Importante:** Siempre commit + push + `git pull` en el servidor. Nunca usar `scp` directo — el repo y el servidor quedarían desincronizados.
> `nginx -s reload` a veces no aplica cambios de bind mounts — usar `docker restart preurbano-new-web-1` para garantizar que nginx tome el nuevo config.

## Estructura del backend
```
backend/
├── main.py              # FastAPI app, middlewares, routers
├── auth.py              # JWT admin + JWT estudiante
├── database.py          # SQLAlchemy engine + SessionLocal (db.sqlite)
├── models.py            # Subscriber, User, Question  ← solo modelos de negocio
├── schemas.py           # Pydantic schemas
├── admin.html           # Panel admin (SPA vanilla JS)
├── student.html         # App estudiante (SPA vanilla JS)
├── analytics/           # Observabilidad — DB separada (analytics.sqlite)
│   ├── database.py      # Engine SQLAlchemy apuntando a analytics.sqlite
│   └── models.py        # ImageLoadError (y futuros eventos de observabilidad)
├── routers/
│   ├── subscribe.py     # POST /api/subscribe
│   ├── admin.py         # /admin/* (login, subscribers, users)
│   ├── auth.py          # /auth/google/* + /auth/me + /auth/profile
│   ├── questions.py     # /admin/questions/* (banco de preguntas)
│   └── logs.py          # POST /api/log/image-error (analytics)
└── Dockerfile
```

## Variables de entorno (`.env` en el servidor — nunca en git)
```
CLOUDFLARE_TUNNEL_TOKEN=...
ADMIN_PASSWORD=...
JWT_SECRET=...
CORS_ORIGINS=https://preurbano.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APP_BASE_URL=https://preurbano.com
ANTHROPIC_API_KEY=...   # presente en .env pero ya no se usa activamente
```

## Modelos de DB actuales
- **Subscriber:** email, source (hero|cta), created_at
- **User:** google_id, email, name, picture, is_active, document_id, phone, created_at
- **Question:** subject, correct_option (A|B|C|D), image_path, created_at

## Banco de preguntas
El admin sube una imagen (JPG/PNG/WebP, máx 20 MB) que contiene la pregunta completa con sus opciones visuales. Selecciona manualmente la materia y la respuesta correcta. No hay procesamiento con IA.

- Imágenes guardadas en `/app/uploads/` (volume montado en `./uploads/`)
- Servidas vía FastAPI `StaticFiles` en `/uploads/`
- En el admin HTML las URLs apuntan a `https://preurbano.com/uploads/<filename>` (no al dominio admin) porque el tunnel de Cloudflare para `admin.preurbano.com` no enruta `/uploads/` correctamente
- Paginación: 20 preguntas por página, endpoint retorna `{items, total, page, page_size, pages}`

## Rutas API
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/subscribe` | — | Registra email |
| POST | `/admin/login` | — | Login admin → JWT |
| GET | `/admin/subscribers` | Admin JWT | Lista suscriptores |
| GET | `/admin/users` | Admin JWT | Lista usuarios Google |
| GET | `/auth/google/login` | — | Inicia OAuth2 Google |
| GET | `/auth/google/callback` | — | Callback OAuth2 |
| GET | `/auth/me` | User JWT | Perfil del usuario |
| PUT | `/auth/profile` | User JWT | Actualiza nombre/documento/teléfono |
| POST | `/admin/questions` | Admin JWT | Crea pregunta (multipart: file + subject + correct_option) |
| GET | `/admin/questions` | Admin JWT | Lista preguntas paginadas (query: subject, page) |
| PATCH | `/admin/questions/{id}` | Admin JWT | Edita subject y/o correct_option |
| DELETE | `/admin/questions/{id}` | Admin JWT | Elimina pregunta y su imagen |

## Nginx
- `preurbano.com` → sirve `index.html` (static) + proxea `/api/`, `/auth/`, `/app`, `/uploads/` al backend
- `admin.preurbano.com` → proxea todo a `backend:8000/admin/` (con trailing slash — crítico); `client_max_body_size 25m`
- `/uploads/` usa `location ^~ /uploads/` para tener prioridad sobre el regex de assets estáticos (`.png`, `.jpg`, etc.)
- Rate limiting: `/api/subscribe` → 5 req/min por IP
- **Cache de estáticos:** `.js` y `.css` se cachean con `max-age=1 año, immutable`. Al modificar `student.js`, `student.css`, `admin.css`, `app.js`, etc., hay que incrementar el query param de versión en el HTML que los referencia (ej. `?v=2` → `?v=3`) para que los browsers los recarguen. Lo mismo aplica a `landing.css` / `landing.js` referenciados desde `index.html`.

## Secretos del servidor (macOS Keychain)
```bash
security find-generic-password -a haurbano -s homelab-ubuntu-vm -w  # sudo password VM
```

## Google OAuth
- Client ID: `490876903878-o68vi27ajtkh6pbb4aackvirtiqegh1d.apps.googleusercontent.com`
- Redirect URI registrada: `https://preurbano.com/auth/google/callback`

## Analytics (observabilidad)

Base de datos separada del negocio: `/app/data/analytics.sqlite` (mismo volume `./data`).
Modelos y engine en `backend/analytics/` — nunca mezclar con `models.py` ni `database.py` de negocio.

### Consultas útiles

```bash
# Ver todos los errores de carga de imágenes
ssh haurbano@192.168.1.66 "docker exec preurbano-new-backend-1 python3 -c \"
import sqlite3
rows = sqlite3.connect('/app/data/analytics.sqlite').execute(
  'SELECT id, question_id, image_path, attempts, user_id, user_agent, created_at FROM image_load_errors ORDER BY created_at DESC'
).fetchall()
for r in rows: print(r)
\""

# Contar errores por pregunta (las más problemáticas primero)
ssh haurbano@192.168.1.66 "docker exec preurbano-new-backend-1 python3 -c \"
import sqlite3
rows = sqlite3.connect('/app/data/analytics.sqlite').execute(
  'SELECT question_id, image_path, COUNT(*) as total FROM image_load_errors GROUP BY question_id ORDER BY total DESC'
).fetchall()
for r in rows: print(r)
\""
```

## Backlog
Ver `BACKLOG.md`.
