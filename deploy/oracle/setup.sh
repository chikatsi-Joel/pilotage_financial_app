#!/usr/bin/env bash
# Préparation d'une VM Ubuntu 24.04 (Google Cloud e2-micro, Oracle ARM…) pour Lucia. Idempotent : relançable.
#   bash setup.sh <ip-publique>
set -euo pipefail

IP="${1:?usage: bash setup.sh <ip-publique>}"
REPO="https://github.com/chikatsi-Joel/pilotage_financial_app.git"
APP_DIR="$HOME/lucia"
DEPLOY_DIR="$APP_DIR/deploy/oracle"

# 1. Docker (dépôt officiel).
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# 2. Petite VM (e2-micro : 1 Go de RAM) : 2 Go de swap pour Postgres + API + build Docker.
if [ ! -f /swapfile ] && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 3000000 ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# 3. Pare-feu local : seule l'image Oracle rejette tout sauf SSH (règle REJECT dans INPUT).
#    Sur Google Cloud, il suffit d'avoir coché « Autoriser HTTP/HTTPS » sur la VM.
if sudo iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  for rule in "tcp 80" "tcp 443" "udp 443"; do
    set -- $rule
    sudo iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null \
      || sudo iptables -I INPUT 1 -p "$1" --dport "$2" -j ACCEPT
  done
  sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
  sudo netfilter-persistent save
fi

# 4. Code.
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi

# 5. .env : créé une seule fois, secrets générés sur la VM (jamais transmis).
cd "$DEPLOY_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^DOMAIN=.*|DOMAIN=${IP//./-}.sslip.io|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^SETTINGS_SECRET_KEY=.*|SETTINGS_SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n/+=')|" .env
  chmod 600 .env
  echo ">> .env créé. Ajoute SMTP_PASSWORD dedans (nano $DEPLOY_DIR/.env) puis relance."
fi

# 6. Sauvegarde quotidienne de la base (03:30, 15 jours au plus).
chmod +x "$DEPLOY_DIR/backup.sh"
( crontab -l 2>/dev/null | grep -v lucia-backup; echo "30 3 * * * $DEPLOY_DIR/backup.sh # lucia-backup" ) | crontab -

echo ">> Prêt. Lancement : cd $DEPLOY_DIR && sudo docker compose up -d --build"
