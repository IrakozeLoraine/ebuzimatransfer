#!/usr/bin/env bash
#
# One-time TLS bootstrap for ebuzimatransfer.duckdns.org.
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="ebuzimatransfer.duckdns.org"
EMAIL="irakozeloraine4@gmail.com"   # used by Let's Encrypt for expiry warnings
STAGING=0                            # set to 1 to test against the LE staging CA

COMPOSE="docker compose"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

# 1. Bring up the dependencies Nginx proxies to (so it starts cleanly).
log "Starting backend and frontend..."
$COMPOSE up -d backend frontend

# 2. Create a throwaway self-signed cert so Nginx can boot and serve the ACME challenge.
log "Creating temporary self-signed certificate for $DOMAIN..."
$COMPOSE run --rm --entrypoint "\
  sh -c 'mkdir -p $CERT_PATH && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout $CERT_PATH/privkey.pem \
      -out $CERT_PATH/fullchain.pem \
      -subj \"/CN=$DOMAIN\"'" certbot

# 3. Start Nginx with the dummy cert in place.
log "Starting nginx..."
$COMPOSE up -d nginx
sleep 3

# 4. Remove the dummy cert so certbot can write the real one.
log "Removing temporary certificate..."
$COMPOSE run --rm --entrypoint "rm -rf /etc/letsencrypt/live/$DOMAIN \
  /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# 5. Request the real certificate over the HTTP-01 webroot challenge.
staging_arg=""
[ "$STAGING" != "0" ] && staging_arg="--staging"

log "Requesting Let's Encrypt certificate for $DOMAIN..."
$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    -d $DOMAIN \
    --email $EMAIL \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email \
    --non-interactive" certbot

# 6. Reload Nginx to pick up the real certificate.
log "Reloading nginx..."
$COMPOSE exec nginx nginx -s reload

log "Done. https://$DOMAIN should now serve a valid certificate."
