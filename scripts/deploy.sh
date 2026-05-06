#!/usr/bin/env bash
# deploy.sh — Despliega PreUrbano al servidor de producción
#
# Uso: ./scripts/deploy.sh [--backend] [--web] [--all] [--no-push]
#
#   --backend   Rebuild y reinicia el contenedor FastAPI
#               (cambios en Python, HTML del backend, requirements)
#   --web       Reinicia el contenedor nginx
#               (cambios en index.html, nginx.conf — bind-mounted, sin rebuild)
#   --all       Ambos: rebuild backend + restart web
#   --no-push   Omite el git push (cuando ya se hizo push manualmente)

set -euo pipefail

SSH_USER="haurbano"
SSH_HOST="192.168.1.66"
REMOTE_DIR="/home/haurbano/preurbano-new"
WEB_CONTAINER="preurbano-new-web-1"

DEPLOY_BACKEND=false
DEPLOY_WEB=false
DO_PUSH=true

if [[ $# -eq 0 ]]; then
  echo "Uso: ./scripts/deploy.sh [--backend] [--web] [--all] [--no-push]"
  exit 1
fi

for arg in "$@"; do
  case $arg in
    --backend) DEPLOY_BACKEND=true ;;
    --web)     DEPLOY_WEB=true ;;
    --all)     DEPLOY_BACKEND=true; DEPLOY_WEB=true ;;
    --no-push) DO_PUSH=false ;;
    *) echo "Argumento desconocido: $arg"; exit 1 ;;
  esac
done

if $DO_PUSH; then
  echo "→ git push origin main..."
  git push origin main
fi

echo "→ git pull en el servidor..."
ssh "$SSH_USER@$SSH_HOST" "cd $REMOTE_DIR && git pull"

if $DEPLOY_BACKEND; then
  echo "→ Rebuild backend..."
  ssh "$SSH_USER@$SSH_HOST" "cd $REMOTE_DIR && docker compose up -d --build backend"
fi

if $DEPLOY_WEB; then
  echo "→ Restart nginx..."
  ssh "$SSH_USER@$SSH_HOST" "docker restart $WEB_CONTAINER"
fi

echo "✓ Deploy completo."
