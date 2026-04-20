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
# Cambios solo en index.html (bind mount — no requiere rebuild)
scp index.html haurbano@192.168.1.66:/home/haurbano/preurbano-new/index.html
ssh haurbano@192.168.1.66 "docker restart preurbano-new-web-1"

# Cambios en backend (Python, HTML del backend, requirements)
ssh haurbano@192.168.1.66 "cd /home/haurbano/preurbano-new && git pull && docker compose up -d --build backend"

# Cambios en nginx.conf (bind mount — no requiere rebuild)
scp nginx.conf haurbano@192.168.1.66:/home/haurbano/preurbano-new/nginx.conf
ssh haurbano@192.168.1.66 "docker exec preurbano-new-web-1 nginx -s reload"
```

> **Importante:** `git pull` en el servidor NO actualiza la imagen Docker — siempre hacer `--build` para cambios de Python. El `index.html` y `nginx.conf` usan bind mount y se actualizan sin rebuild, pero hay que reiniciar el contenedor web para que nginx lo tome.

## Estructura del backend
```
backend/
├── main.py              # FastAPI app, middlewares, routers
├── auth.py              # JWT admin + JWT estudiante
├── database.py          # SQLAlchemy engine + SessionLocal
├── models.py            # Subscriber, User
├── schemas.py           # Pydantic schemas
├── admin.html           # Panel admin (SPA vanilla JS)
├── student.html         # App estudiante (SPA vanilla JS)
├── routers/
│   ├── subscribe.py     # POST /api/subscribe
│   ├── admin.py         # /admin/* (login, subscribers, users)
│   └── auth.py          # /auth/google/* + /auth/me + /auth/profile
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
```

## Modelos de DB actuales
- **Subscriber:** email, source (hero|cta), created_at
- **User:** google_id, email, name, picture, is_active, document_id, phone, created_at

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

## Nginx
- `preurbano.com` → sirve `index.html` (static) + proxea `/api/`, `/auth/`, `/app` al backend
- `admin.preurbano.com` → proxea todo a `backend:8000/admin/` (con trailing slash — crítico)
- Rate limiting: `/api/subscribe` → 5 req/min por IP

## Secretos del servidor (macOS Keychain)
```bash
security find-generic-password -a haurbano -s homelab-ubuntu-vm -w  # sudo password VM
```

## Google OAuth
- Client ID: `490876903878-o68vi27ajtkh6pbb4aackvirtiqegh1d.apps.googleusercontent.com`
- Redirect URI registrada: `https://preurbano.com/auth/google/callback`

## Backlog
Ver `BACKLOG.md`. Próximo ítem: banco de preguntas con subida de PDF/imagen + Claude API.
