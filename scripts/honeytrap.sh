#!/usr/bin/env bash
set -euo pipefail

APP_NAME="honeytrap"
DEFAULT_DIR="/var/www/${APP_NAME}"
DEFAULT_PORT="4173"

ACTION=""
APP_DIR=""
DOMAIN=""
EMAIL=""
PORT="${DEFAULT_PORT}"
NO_PROXY="0"
FORCE_REMOVE="0"
INSTALL_PROXY=""

log() { printf "[%s] %s\n" "${APP_NAME}" "$*"; }
fail() { printf "[%s] ERROR: %s\n" "${APP_NAME}" "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage: $0 <install|update|delete> [options]

Options:
  --dir <path>        Install directory (default: ${DEFAULT_DIR})
  --port <port>       App port for preview (default: ${DEFAULT_PORT})
  --domain <domain>   Domain for reverse proxy (optional)
  --email <email>     Email for TLS (optional, used by Caddy/Certbot)
  --no-proxy          Skip reverse proxy setup
  --install-proxy <x> Auto-install reverse proxy (caddy|nginx|none)
  --force-remove      On delete, remove install directory
  -h, --help          Show help

Notes:
- Run from a cloned repo, or ensure origin URL is available.
- Reverse proxy setup is non-destructive (won't overwrite existing configs).
USAGE
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

maybe_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

detect_pkg_mgr() {
  if command -v apt-get >/dev/null 2>&1; then echo "apt"; return; fi
  if command -v dnf >/dev/null 2>&1; then echo "dnf"; return; fi
  if command -v yum >/dev/null 2>&1; then echo "yum"; return; fi
  if command -v pacman >/dev/null 2>&1; then echo "pacman"; return; fi
  if command -v apk >/dev/null 2>&1; then echo "apk"; return; fi
  echo "unknown"
}

install_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return
  fi
  local pm
  pm=$(detect_pkg_mgr)
  log "Node.js not found. Installing via ${pm}."
  case "$pm" in
    apt)
      maybe_sudo apt-get update -y
      maybe_sudo apt-get install -y nodejs npm
      ;;
    dnf)
      maybe_sudo dnf install -y nodejs npm
      ;;
    yum)
      maybe_sudo yum install -y nodejs npm
      ;;
    pacman)
      maybe_sudo pacman -Sy --noconfirm nodejs npm
      ;;
    apk)
      maybe_sudo apk add --no-cache nodejs npm
      ;;
    *)
      fail "Unsupported package manager. Please install Node.js (>=18) and npm manually."
      ;;
  esac
}

ensure_app_dir() {
  if [ -n "$APP_DIR" ]; then
    return
  fi
  APP_DIR="${DEFAULT_DIR}"
}

resolve_source_repo() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git remote get-url origin >/dev/null 2>&1 || return 1
    git remote get-url origin
    return 0
  fi
  return 1
}

sync_repo() {
  local src_dir="$1"
  local dest_dir="$2"
  if [ -d "$dest_dir/.git" ]; then
    return
  fi
  mkdir -p "$dest_dir"
  rsync -a --exclude node_modules --exclude dist --exclude .git "$src_dir/" "$dest_dir/"
}

clone_or_sync_repo() {
  local origin
  if [ -d "$APP_DIR/.git" ]; then
    return
  fi
  origin=$(resolve_source_repo || true)
  if [ -n "$origin" ]; then
    log "Cloning into ${APP_DIR} from ${origin}."
    require_cmd git
    git clone "$origin" "$APP_DIR"
    return
  fi
  if [ -d .git ]; then
    log "Syncing working tree to ${APP_DIR}."
    sync_repo "$(pwd)" "$APP_DIR"
    return
  fi
  fail "No git origin found. Run from a cloned repo or provide a repo in ${APP_DIR}."
}

install_deps_and_build() {
  log "Installing dependencies."
  (cd "$APP_DIR" && npm install)
  log "Building app."
  (cd "$APP_DIR" && npm run build)
}

write_systemd_service() {
  local service="${APP_NAME}.service"
  local user="${SUDO_USER:-$USER}"
  local unit="/etc/systemd/system/${service}"
  local cmd="/usr/bin/env npm run preview -- --host 0.0.0.0 --port ${PORT}"

  log "Writing systemd unit (${service})."
  maybe_sudo tee "$unit" >/dev/null <<UNIT
[Unit]
Description=Honeytrap Nostr PWA
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
User=${user}
Environment=NODE_ENV=production
ExecStart=${cmd}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

  maybe_sudo systemctl daemon-reload
  maybe_sudo systemctl enable --now "$service"
}

restart_service() {
  maybe_sudo systemctl restart "${APP_NAME}.service" || true
}

setup_nginx() {
  local conf="/etc/nginx/sites-available/${APP_NAME}.conf"
  local enabled="/etc/nginx/sites-enabled/${APP_NAME}.conf"
  if [ -f "$conf" ]; then
    log "Nginx config exists: ${conf} (skipping)."
    return
  fi
  if [ -z "$DOMAIN" ]; then
    log "No domain provided; skipping nginx config."
    return
  fi
  log "Creating nginx config for ${DOMAIN}."
  maybe_sudo tee "$conf" >/dev/null <<NGINX
# ${APP_NAME} managed block
server {
  listen 80;
  server_name ${DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_cache_bypass \$http_upgrade;
  }
}
NGINX
  maybe_sudo ln -s "$conf" "$enabled" >/dev/null 2>&1 || true
  maybe_sudo nginx -t && maybe_sudo systemctl reload nginx
}

setup_caddy() {
  local caddyfile="/etc/caddy/Caddyfile"
  local confd_dir="/etc/caddy/conf.d"
  local dropin_dir="/etc/caddy/Caddyfile.d"
  local target=""
  local exists="0"

  if [ -z "$DOMAIN" ]; then
    log "No domain provided; skipping Caddy config."
    return
  fi

  if [ -d "$confd_dir" ]; then
    target="${confd_dir}/${APP_NAME}.caddy"
  elif [ -d "$dropin_dir" ]; then
    target="${dropin_dir}/${APP_NAME}.caddy"
  else
    target="$caddyfile"
  fi

  if [ "$target" != "$caddyfile" ]; then
    if [ -f "$target" ]; then exists="1"; fi
    if [ "$exists" = "1" ]; then
      log "Caddy config exists: ${target} (skipping)."
      return
    fi
    log "Writing Caddy config to ${target}."
    maybe_sudo tee "$target" >/dev/null <<CADDY
# ${APP_NAME} managed block
${DOMAIN} {
  reverse_proxy 127.0.0.1:${PORT}
}
CADDY
    maybe_sudo systemctl reload caddy
    return
  fi

  if [ ! -f "$caddyfile" ]; then
    return
  fi
  if grep -q "${APP_NAME} managed block" "$caddyfile"; then
    log "Caddy already configured for ${APP_NAME}."
    return
  fi
  log "Appending Caddy config for ${DOMAIN}."
  maybe_sudo tee -a "$caddyfile" >/dev/null <<CADDY

# ${APP_NAME} managed block
${DOMAIN} {
  reverse_proxy 127.0.0.1:${PORT}
}
CADDY
  maybe_sudo systemctl reload caddy
}

setup_proxy() {
  if [ "$NO_PROXY" = "1" ]; then
    log "Skipping reverse proxy setup."
    return
  fi
  if command -v nginx >/dev/null 2>&1; then
    setup_nginx
    return
  fi
  if command -v caddy >/dev/null 2>&1; then
    setup_caddy
    return
  fi
  if [ "$INSTALL_PROXY" = "none" ]; then
    log "No proxy detected; skipping install (per flag)."
    return
  fi

  if [ -z "$INSTALL_PROXY" ]; then
    echo "No reverse proxy detected. Install Caddy (recommended)? [Y/n]"
    read -r reply
    if [[ "$reply" =~ ^[nN]$ ]]; then
      INSTALL_PROXY="none"
    else
      INSTALL_PROXY="caddy"
    fi
  fi

  case "$INSTALL_PROXY" in
    caddy)
      install_caddy
      setup_caddy
      ;;
    nginx)
      install_nginx
      setup_nginx
      ;;
    none)
      log "No proxy detected; skipping install."
      ;;
    *)
      fail "Unknown --install-proxy value: ${INSTALL_PROXY}"
      ;;
  esac
}

install_caddy() {
  if command -v caddy >/dev/null 2>&1; then return; fi
  local pm
  pm=$(detect_pkg_mgr)
  log "Installing Caddy via ${pm}."
  case "$pm" in
    apt)
      maybe_sudo apt-get update -y
      maybe_sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
      curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | maybe_sudo tee /usr/share/keyrings/caddy-stable-archive-keyring.gpg >/dev/null
      curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | maybe_sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
      maybe_sudo apt-get update -y
      maybe_sudo apt-get install -y caddy
      ;;
    dnf)
      maybe_sudo dnf install -y 'dnf-command(copr)'
      maybe_sudo dnf copr enable -y @caddy/caddy
      maybe_sudo dnf install -y caddy
      ;;
    yum)
      maybe_sudo yum install -y yum-plugin-copr
      maybe_sudo yum copr enable -y @caddy/caddy
      maybe_sudo yum install -y caddy
      ;;
    pacman)
      maybe_sudo pacman -Sy --noconfirm caddy
      ;;
    apk)
      maybe_sudo apk add --no-cache caddy
      ;;
    *)
      fail "Unsupported package manager. Install Caddy manually."
      ;;
  esac
}

install_nginx() {
  if command -v nginx >/dev/null 2>&1; then return; fi
  local pm
  pm=$(detect_pkg_mgr)
  log "Installing nginx via ${pm}."
  case "$pm" in
    apt)
      maybe_sudo apt-get update -y
      maybe_sudo apt-get install -y nginx
      ;;
    dnf)
      maybe_sudo dnf install -y nginx
      ;;
    yum)
      maybe_sudo yum install -y nginx
      ;;
    pacman)
      maybe_sudo pacman -Sy --noconfirm nginx
      ;;
    apk)
      maybe_sudo apk add --no-cache nginx
      ;;
    *)
      fail "Unsupported package manager. Install nginx manually."
      ;;
  esac
}

handle_install() {
  ensure_app_dir
  install_node
  clone_or_sync_repo
  install_deps_and_build
  write_systemd_service
  setup_proxy
  log "Install complete."
}

handle_update() {
  ensure_app_dir
  require_cmd git
  if [ ! -d "$APP_DIR/.git" ]; then
    fail "${APP_DIR} is not a git repo."
  fi
  log "Checking for updates."
  (cd "$APP_DIR" && git fetch)
  local_head=$(cd "$APP_DIR" && git rev-parse HEAD)
  remote_head=$(cd "$APP_DIR" && git rev-parse @{u} || true)
  if [ -z "$remote_head" ]; then
    fail "No upstream configured."
  fi
  if [ "$local_head" = "$remote_head" ]; then
    log "Already up to date."
    return
  fi
  log "Pulling updates."
  (cd "$APP_DIR" && git pull --ff-only)
  install_deps_and_build
  restart_service
  log "Update complete."
}

handle_delete() {
  ensure_app_dir
  maybe_sudo systemctl stop "${APP_NAME}.service" || true
  maybe_sudo systemctl disable "${APP_NAME}.service" || true
  maybe_sudo rm -f "/etc/systemd/system/${APP_NAME}.service"
  maybe_sudo systemctl daemon-reload

  if command -v nginx >/dev/null 2>&1; then
    maybe_sudo rm -f "/etc/nginx/sites-available/${APP_NAME}.conf" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
    maybe_sudo nginx -t && maybe_sudo systemctl reload nginx || true
  fi

  if [ "$FORCE_REMOVE" = "1" ]; then
    log "Removing ${APP_DIR}."
    maybe_sudo rm -rf "$APP_DIR"
  else
    log "Leaving ${APP_DIR} intact (use --force-remove to delete)."
  fi
  log "Delete complete."
}

parse_args() {
  if [ $# -lt 1 ]; then
    usage
    exit 1
  fi
  ACTION="$1"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)
        APP_DIR="$2"; shift 2 ;;
      --port)
        PORT="$2"; shift 2 ;;
      --domain)
        DOMAIN="$2"; shift 2 ;;
      --email)
        EMAIL="$2"; shift 2 ;;
      --no-proxy)
        NO_PROXY="1"; shift ;;
      --install-proxy)
        INSTALL_PROXY="$2"; shift 2 ;;
      --force-remove)
        FORCE_REMOVE="1"; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        fail "Unknown argument: $1" ;;
    esac
  done
}

parse_args "$@"

case "$ACTION" in
  install) handle_install ;;
  update) handle_update ;;
  delete) handle_delete ;;
  *) usage; exit 1 ;;
esac
