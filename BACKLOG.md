# PreUrbano — Backlog

## Features

### Admin

- [ ] **Simulacros curados por el admin** *(pendiente de definición — ver preguntas abiertas abajo)*
  El admin arma manualmente un simulacro eligiendo pregunta por pregunta cuáles van, en vez de la selección aleatoria actual. Los estudiantes toman ese simulacro curado.

  **Preguntas abiertas antes de planear:**
  - ¿Puede haber múltiples simulacros activos al mismo tiempo, o solo uno activo que el admin reemplaza?
  - ¿El estudiante elige qué simulacro hacer (si hay varios), o siempre toma el activo?
  - ¿Un simulacro curado reemplaza la selección aleatoria, o coexisten (curado + aleatorio)?
  - ¿Las preguntas del simulacro curado se muestran en un orden fijo (el que el admin definió) o se mezclan?
  - ¿El simulacro curado tiene límite de intentos o el estudiante puede repetirlo?

- [x] **Habilitar y restringir usuarios por correo**
  En el panel admin, poder aprobar o bloquear usuarios individuales por su dirección de correo. Los usuarios restringidos no pueden acceder aunque tengan cuenta.

### Estudiantes

- [x] **Login con Google**
  Autenticación OAuth2 con Google. Los estudiantes usan su cuenta Google para iniciar sesión, sin necesidad de registro manual.

---

## Seguridad

### Crítico

- [x] **Eliminar valores por defecto inseguros en secretos** — `auth.py:7-8`
  `JWT_SECRET` y `ADMIN_PASSWORD` tienen fallbacks (`"change-me-in-production"`, `"admin"`). Remover defaults y lanzar excepción en startup si las variables de entorno no están definidas.

- [x] **Mover token JWT de URL a cookie HttpOnly** — `routers/auth.py:71`
  El redirect OAuth envía el token en la URL (`?token=...`), exponiéndolo en logs de nginx/Cloudflare, historial del browser y header `Referer`. Cambiar a cookie `HttpOnly; Secure; SameSite=Lax`.

- [x] **Agregar rate limiting al endpoint `/admin/login`** — `routers/admin.py:29`
  El login admin no tiene protección contra fuerza bruta. Agregar límite en nginx (ej. 5 req/min por IP), similar al que ya existe para `/api/subscribe`.

### Alto

- [ ] **Derivar extensión de archivo desde content-type, no del nombre** — `routers/questions.py:42`
  La extensión se extrae del nombre enviado por el usuario. Usar el `content_type` validado para determinar la extensión (`image/jpeg` → `jpg`, etc.).

- [ ] **Separar secreto de sesión del secreto JWT** — `main.py:18`
  `SessionMiddleware` y JWT comparten el mismo `JWT_SECRET`. Introducir variable de entorno separada `SESSION_SECRET`.

- [ ] **Unificar mensajes de error para evitar enumeración de usuarios** — `routers/auth.py`
  Distintos mensajes según si el usuario existe o no permiten enumerar IDs válidos. Retornar siempre un mensaje genérico (ej. `"No autorizado"`).

### Medio

- [ ] **Agregar headers de seguridad faltantes en nginx** — `nginx.conf`
  Faltan: `Strict-Transport-Security`, `Content-Security-Policy`, `X-XSS-Protection`. Agregarlos en el bloque `add_header` existente.

- [ ] **Usar `get_db()` dependency de forma consistente** — varios routers
  Algunos routers usan `SessionLocal()` manual en vez del dependency `get_db()`, lo que puede dejar conexiones abiertas ante errores. Unificar usando `Depends(get_db)`.

- [ ] **Agregar expiración al state de OAuth** — `routers/auth.py:36`
  El state OAuth no tiene TTL. Guardar también el timestamp al crear el state y rechazarlo si tiene más de 10 minutos.

### Bajo

- [ ] **Agregar límite superior a paginación** — `routers/questions.py:70`
  El parámetro `page` no tiene máximo. Agregar `le=10000` para prevenir consultas abusivas.

- [ ] **Agregar validación de longitud a campos de perfil** — `schemas.py`
  Los campos `name`, `document_id` y `phone` en `UserProfileUpdate` no tienen `max_length`. Agregar con `Field(..., max_length=255)`.

- [ ] **Lanzar error explícito para `source` inválido** — `schemas.py:17`
  Valor inválido en `source` cae silenciosamente a `"hero"`. Lanzar `ValueError` para exponer errores del cliente.

- [ ] **Agregar logging de eventos de seguridad**
  No se registran intentos de login fallidos, errores de validación de token ni uploads. Agregar logs con `logging.warning()` para auditoría.
