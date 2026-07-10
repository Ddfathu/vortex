FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PORT=8080
ENV DATA_DIR=/data
ENV SSH_PORT=22
ENV SSH_SSL_PORT=2443
ENV WS_INTERNAL_PORT=8880

RUN apt-get update && apt-get install -y --no-install-recommends \
    dropbear \
    stunnel4 \
    python3 \
    sudo \
    curl \
    procps \
    ca-certificates \
    passwd \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /usr/local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    && chmod +x /usr/local/bin/cloudflared

RUN mkdir -p /app /data /var/run/dropbear /etc/dropbear /etc/profile.d
WORKDIR /app

COPY package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js /app/server.js
COPY vortex.env /app/vortex.env
COPY .env.example /app/.env.example
COPY VARIABLES.txt /app/VARIABLES.txt
COPY ws-proxy.py /usr/local/bin/ws-proxy.py
COPY entrypoint.sh /entrypoint.sh
COPY scripts/addssh /usr/local/sbin/addssh
COPY scripts/delssh /usr/local/sbin/delssh
COPY scripts/listssh /usr/local/sbin/listssh
COPY scripts/menu /usr/local/sbin/menu
COPY scripts/vortex-clean-expired /usr/local/sbin/vortex-clean-expired
COPY scripts/vortexbanner.sh /etc/profile.d/vortexbanner.sh
COPY scripts/vortex-banner.sh /etc/profile.d/vortex-banner.sh

RUN chmod +x /entrypoint.sh /usr/local/bin/ws-proxy.py \
    /usr/local/sbin/addssh /usr/local/sbin/delssh /usr/local/sbin/listssh \
    /usr/local/sbin/menu /usr/local/sbin/vortex-clean-expired \
    /etc/profile.d/vortexbanner.sh /etc/profile.d/vortex-banner.sh

EXPOSE 8080 22 2443 8880
ENTRYPOINT ["/entrypoint.sh"]
