#!/bin/bash
set -e

# Load variable dari file env.
# Urutan:
# 1. /data/vortex.env  -> cocok kalau mau edit dari Railway Console/Volume
# 2. /app/vortex.env   -> cocok kalau mau edit dari GitHub
# 3. /app/.env         -> fallback standar
# Railway Variables tetap menang dan tidak ditimpa oleh file.
load_env_file() {
  ENV_FILE="$1"
  [ -f "$ENV_FILE" ] || return 0
  echo "[VORTEX] loading env file: $ENV_FILE"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | tr -d '[:space:]')"
    [ -z "$key" ] && continue
    case "$key" in
      *[!A-Za-z0-9_]*)
        echo "[VORTEX] skip invalid env key: $key"
        continue
        ;;
    esac
    # Hapus quote sederhana di awal/akhir.
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    # Jangan timpa variable yang sudah diisi Railway.
    eval "current=\${$key:-}"
    if [ -z "$current" ]; then
      export "$key=$val"
    fi
  done < "$ENV_FILE"
}

load_env_file "/data/vortex.env"
load_env_file "/app/vortex.env"
load_env_file "/app/.env"


export DATA_DIR="${DATA_DIR:-/data}"
export PORT="${PORT:-8080}"
export SSH_PORT="${SSH_PORT:-22}"
export SSH_SSL_PORT="${SSH_SSL_PORT:-2443}"
export WS_INTERNAL_PORT="${WS_INTERNAL_PORT:-8880}"

MAIN_USER="${SSH_USER:-}"
MAIN_PASS="${SSH_PASSWORD:-}"

echo "[VORTEX] Railway dashboard mode starting..."
echo "[VORTEX] Dashboard listens on PORT=${PORT}"
echo "[VORTEX] SSH WS listens on WS_INTERNAL_PORT=${WS_INTERNAL_PORT}"
echo "[VORTEX] Internal SSH listens on 0.0.0.0:${SSH_PORT}"
echo "[VORTEX] SSH SSL/SNI listens on 0.0.0.0:${SSH_SSL_PORT} -> 127.0.0.1:${SSH_PORT}"

mkdir -p "$DATA_DIR" /var/run/dropbear /etc/dropbear /etc/profile.d /etc/stunnel
chmod 755 "$DATA_DIR"
touch "$DATA_DIR/users.txt"

SERVER_HOST="$(curl -s --max-time 3 ipinfo.io/country 2>/dev/null | tr -d '
' || true)"
[ -z "$SERVER_HOST" ] && SERVER_HOST="Unknown"

case "$SERVER_HOST" in
  ID) FLAG="🇮🇩" ;;
  US) FLAG="🇺🇸" ;;
  SG) FLAG="🇸🇬" ;;
  JP) FLAG="🇯🇵" ;;
  MY) FLAG="🇲🇾" ;;
  TH) FLAG="🇹🇭" ;;
  VN) FLAG="🇻🇳" ;;
  PH) FLAG="🇵🇭" ;;
  IN) FLAG="🇮🇳" ;;
  GB|UK) FLAG="🇬🇧" ;;
  DE) FLAG="🇩🇪" ;;
  FR) FLAG="🇫🇷" ;;
  NL) FLAG="🇳🇱" ;;
  CA) FLAG="🇨🇦" ;;
  AU) FLAG="🇦🇺" ;;
  *) FLAG="🌐" ;;
esac

cat > /etc/dropbear_banner <<EOF
<p style="text-align:center"><font color="green"><b>क═══════क⊹⊱✫⊰⊹क═══════क</b></font><br><font color="cyan"><b>SSH RAILWAY PREMIUM</b></font><br><font color="green"><b>क═══════क⊹⊱✫⊰⊹क═══════क</b></font><br><font color="cyan"><b>SERVER</b></font><br><br><big><big><big><big><big><big><big><big><big>${FLAG}</big></big></big></big></big></big></big></big></big></p>
EOF

if [ ! -f /etc/dropbear/dropbear_rsa_host_key ]; then
  dropbearkey -t rsa -f /etc/dropbear/dropbear_rsa_host_key >/dev/null 2>&1 || true
fi
if [ ! -f /etc/dropbear/dropbear_ecdsa_host_key ]; then
  dropbearkey -t ecdsa -f /etc/dropbear/dropbear_ecdsa_host_key >/dev/null 2>&1 || true
fi
if [ ! -f /etc/dropbear/dropbear_ed25519_host_key ]; then
  dropbearkey -t ed25519 -f /etc/dropbear/dropbear_ed25519_host_key >/dev/null 2>&1 || true
fi


write_dropbear_connect_banner() {
  SERVER_COUNTRY="$(curl -s --max-time 3 ipinfo.io/country 2>/dev/null | tr -d '\r\n' || true)"
  [ -z "$SERVER_COUNTRY" ] && SERVER_COUNTRY="Unknown"

  case "$SERVER_COUNTRY" in
    ID) FLAG="🇮🇩" ;;
    US) FLAG="🇺🇸" ;;
    SG) FLAG="🇸🇬" ;;
    JP) FLAG="🇯🇵" ;;
    MY) FLAG="🇲🇾" ;;
    TH) FLAG="🇹🇭" ;;
    VN) FLAG="🇻🇳" ;;
    PH) FLAG="🇵🇭" ;;
    IN) FLAG="🇮🇳" ;;
    GB|UK) FLAG="🇬🇧" ;;
    DE) FLAG="🇩🇪" ;;
    FR) FLAG="🇫🇷" ;;
    NL) FLAG="🇳🇱" ;;
    CA) FLAG="🇨🇦" ;;
    AU) FLAG="🇦🇺" ;;
    *) FLAG="🌐" ;;
  esac

  cat > /etc/dropbear_banner <<EOF
<p style="text-align:center"><font color="green"><b>क═══════क⊹⊱✫⊰⊹क═══════क</b></font><br><font color="cyan"><b>SSH RAILWAY PREMIUM</b></font><br><font color="green"><b>क═══════क⊹⊱✫⊰⊹क═══════क</b></font><br><font color="cyan"><b>SERVER</b></font><br><br><big><big><big><big><big><big><big><big><big>${FLAG}</big></big></big></big></big></big></big></big></big></p>
EOF

  # Samakan juga fallback banner agar SSH WS dan SSH SNI tidak beda tampilan di client tertentu.
  cp /etc/dropbear_banner /etc/issue.net 2>/dev/null || true
  cp /etc/dropbear_banner /etc/motd 2>/dev/null || true
}

write_dropbear_connect_banner

# Optional default user.
# Tidak ada akun bawaan otomatis.
# Kalau mau akun default, isi SSH_USER dan SSH_PASSWORD di Railway Variables.
if [ -n "$MAIN_USER" ] && [ -n "$MAIN_PASS" ]; then
  echo "[VORTEX] creating optional default SSH user: $MAIN_USER"
  if ! id "$MAIN_USER" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "$MAIN_USER" >/dev/null 2>&1 || true
  fi
  echo "$MAIN_USER:$MAIN_PASS" | chpasswd >/dev/null 2>&1 || true
else
  echo "[VORTEX] no default SSH user created; use SSH Manager/addssh to create users"
fi

# Restore akun dari /data/users.txt
TODAY="$(date +%F)"
TMP_FILE="$DATA_DIR/users.clean"
: > "$TMP_FILE"
while IFS=: read -r USERNAME PASSWORD EXP_DATE; do
  [ -z "$USERNAME" ] && continue
  [ -z "$PASSWORD" ] && continue
  [ -z "$EXP_DATE" ] && EXP_DATE="$(date -d '+30 days' +%F 2>/dev/null || date +%F)"
  if [ "$EXP_DATE" \> "$TODAY" ] || [ "$EXP_DATE" = "$TODAY" ]; then
    if ! id "$USERNAME" >/dev/null 2>&1; then
      useradd -m -s /bin/bash -e "$EXP_DATE" "$USERNAME" >/dev/null 2>&1 || true
    else
      usermod -e "$EXP_DATE" "$USERNAME" >/dev/null 2>&1 || true
    fi
    echo "$USERNAME:$PASSWORD" | chpasswd >/dev/null 2>&1 || true
    echo "$USERNAME:$PASSWORD:$EXP_DATE" >> "$TMP_FILE"
  else
    userdel -f "$USERNAME" >/dev/null 2>&1 || true
  fi
done < "$DATA_DIR/users.txt"
mv "$TMP_FILE" "$DATA_DIR/users.txt"

# Console banner
cat > /etc/profile.d/99-vortex-console.sh <<'EOF'
#!/bin/bash
[ -n "$VORTEX_CONSOLE_SHOWN" ] && return 0 2>/dev/null || true
export VORTEX_CONSOLE_SHOWN=1
if [ -f /etc/profile.d/vortexbanner.sh ]; then
  . /etc/profile.d/vortexbanner.sh
fi
EOF
chmod +x /etc/profile.d/99-vortex-console.sh


setup_stunnel() {
  mkdir -p /etc/stunnel
  if [ ! -f /etc/stunnel/stunnel.pem ]; then
    openssl req -new -x509 -days 3650 -nodes \
      -subj "/CN=VORTEX-PROJECT" \
      -out /etc/stunnel/stunnel.pem \
      -keyout /etc/stunnel/stunnel.pem >/dev/null 2>&1 || true
    chmod 600 /etc/stunnel/stunnel.pem 2>/dev/null || true
  fi

  cat > /etc/stunnel/dropbear.conf <<EOF
foreground = yes
pid =
debug = 3
output = /dev/stdout

[ssh-sni]
accept = 0.0.0.0:${SSH_SSL_PORT}
connect = 127.0.0.1:${SSH_PORT}
cert = /etc/stunnel/stunnel.pem
EOF
}

stunnel_watchdog() {
  while true; do
    if ! pgrep -f "stunnel.*dropbear.conf" >/dev/null 2>&1; then
      echo "[VORTEX] starting stunnel SSH SSL/SNI on 0.0.0.0:${SSH_SSL_PORT} -> 127.0.0.1:${SSH_PORT}"
      setup_stunnel
      stunnel /etc/stunnel/dropbear.conf &
    fi
    sleep 30
  done
}

cleanup_loop() {
  while true; do
    if [ -f /usr/local/sbin/vortex-clean-expired ]; then
      /usr/local/sbin/vortex-clean-expired >/dev/null 2>&1 || true
    fi
    sleep 3600
  done
}

dropbear_watchdog() {
  while true; do
    if ! pgrep -x dropbear >/dev/null 2>&1; then
      echo "[VORTEX] starting Dropbear on 0.0.0.0:${SSH_PORT}"
      write_dropbear_connect_banner
      /usr/sbin/dropbear -F -E -p 0.0.0.0:${SSH_PORT} -b /etc/dropbear_banner -W 65536 &
    fi
    sleep 30
  done
}

ws_proxy_watchdog() {
  while true; do
    if ! pgrep -f "/usr/local/bin/ws-proxy.py" >/dev/null 2>&1; then
      echo "[VORTEX] starting ws-proxy on 0.0.0.0:${WS_INTERNAL_PORT}"
      WS_PORT="${WS_INTERNAL_PORT}" WS_TARGET_HOST="127.0.0.1" WS_TARGET_PORT="${SSH_PORT}" \
        python3 /usr/local/bin/ws-proxy.py &
    fi
    sleep 30
  done
}

cloudflared_start() {
  if [ -n "$CF_TUNNEL_TOKEN" ]; then
    echo "[VORTEX] starting Cloudflare Tunnel with CF_TUNNEL_TOKEN"
    cloudflared tunnel run --token "$CF_TUNNEL_TOKEN" &
  else
    echo "[VORTEX] CF_TUNNEL_TOKEN empty, tunnel skipped"
  fi
}


cat > /usr/local/sbin/showbanner <<'EOF'
#!/bin/bash
echo "=== Dropbear connect banner (/etc/dropbear_banner) ==="
cat /etc/dropbear_banner 2>/dev/null || echo "Banner belum dibuat."
echo
echo "=== Console banner script (/etc/profile.d/vortexbanner.sh) ==="
cat /etc/profile.d/vortexbanner.sh 2>/dev/null || echo "Console banner belum ada."
EOF
chmod +x /usr/local/sbin/showbanner

cleanup_loop &
dropbear_watchdog &
ws_proxy_watchdog &
stunnel_watchdog &
cloudflared_start

cd /app
exec node server.js

