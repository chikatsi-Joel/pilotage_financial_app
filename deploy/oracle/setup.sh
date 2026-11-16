#!/usr/bin/env bash
# Préparation d'une VM Oracle Cloud (Ubuntu 24.04, ARM) pour Lucia. Idempotent : relançable.
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

# 2. Pare-feu de l'image Oracle : elle rejette tout sauf SSH (iptables), en plus de la Security List.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save

# 3. Code.
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi

# 4. .env : créé une seule fois, secrets générés sur la VM (jamais transmis).
cd "$DEPLOY_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^DOMAIN=.*|DOMAIN=${IP//./-}.sslip.io|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^SETTINGS_SECRET_KEY=.*|SETTINGS_SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n/+=')|" .env
  chmod 600 .env
  echo ">> .env créé. Ajoute SMTP_PASSWORD dedans (nano $DEPLOY_DIR/.env) puis relance."
fi

# 5. Sauvegarde quotidienne de la base (03:30, 15 jours au plus).
chmod +x "$DEPLOY_DIR/backup.sh"
( crontab -l 2>/dev/null | grep -v lucia-backup; echo "30 3 * * * $DEPLOY_DIR/backup.sh # lucia-backup" ) | crontab -

echo ">> Prêt. Lancement : cd $DEPLOY_DIR && sudo docker compose up -d --build"
