#!/usr/bin/env bash
# Sauvegarde de la base Lucia (format custom pg_dump), 15 jours au plus. Lancé par cron.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$HOME/lucia-backups"
mkdir -p "$OUT"
cd "$DIR"
sudo docker compose exec -T db pg_dump -U finance -d finance -Fc > "$OUT/lucia-$(date +%F).dump"
find "$OUT" -name 'lucia-*.dump' -mtime +14 -delete
