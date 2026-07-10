# QUICK START VORTEX PROJECT

1. Deploy ke Railway dari GitHub.
2. Pasang Volume dengan mount path `/data`.
3. Isi Variables:
   - `CF_TUNNEL_TOKEN`
   - `SSH_USER=vortex`
   - `SSH_PASSWORD=vortex123`
   - `ADMIN_PASS=password_hapus_yang_kuat`
   - `DATA_DIR=/data`
   - `SSH_PORT=22`
   - `WS_INTERNAL_PORT=8880`
   - `PUBLIC_HOST=domain-ssh-kamu`
   - `SSH_PUBLIC_HOST=domain-ssh-kamu`
   - `SSH_PUBLIC_PATH=/`
   - `XRAY_PUBLIC_HOST=domain-xray-kamu`
4. Zero Trust Public Hostname:
   - Hostname: `vortex.domainkamu.com`
   - Service: `HTTP`
   - URL: `localhost:8880`
5. Dashboard buka dari domain Railway.
6. SSH pakai domain Cloudflare Tunnel.

7. Untuk Xray/VLESS/Trojan di Zero Trust: `vortex.nizwara.qzz.io -> HTTP -> localhost:8080`.

Tambahan untuk generator SNI:
- `SNI_PUBLIC_HOST=nama-project.up.railway.app`

Tambahan SSH SNI:
- Isi `SNI_PUBLIC_HOST=nama-project.up.railway.app`
- Di daftar user klik tombol `SSH SNI` kalau ingin config SNI.

SSH SNI Railway TCP Proxy:
- Buat TCP Proxy di Railway untuk port internal `22`.
- Isi `SSH_SNI_HOST=host.proxy.rlwy.net`.
- Isi `SSH_SNI_PORT=port_tcp_proxy`.

# No Default SSH User

Versi ini tidak membuat akun SSH bawaan otomatis.
Buat user dari dashboard SSH Manager atau command `addssh`.

Variable minimal:
- `CF_TUNNEL_TOKEN`
- `DATA_DIR=/data`
- `SSH_PORT=22`
- `WS_INTERNAL_PORT=8880`
- `ADMIN_PASS=Vortex`
- `PUBLIC_HOST=ssh-ws.nizwara.qzz.io`
- `SSH_PUBLIC_HOST=ssh-ws.nizwara.qzz.io`
- `SSH_PUBLIC_PATH=/`

`SSH_USER` dan `SSH_PASSWORD` hanya opsional kalau ingin akun default.

# Pakai vortex.env

Edit file `vortex.env`, isi variable, lalu redeploy Railway.

File ini otomatis dibaca saat container start. Railway Variables tetap lebih kuat kalau nama variable sama.

SSH Config Buttons Fix:
- Di daftar user klik `SSH WS` atau `SSH SNI`.
- Setelah tambah user, output menampilkan dua format sekaligus.

Xray SNI tetap WS:
- VLESS/Trojan SNI tetap `type=ws`.
- Bedanya hanya domain memakai `SNI_PUBLIC_HOST`.

SSH WS dan SSH SNI Banner Sama:
- Banner connect memakai `/etc/dropbear_banner` untuk WS dan SNI.

SSH SNI Connect Fix:
- Buat TCP Proxy Railway ke internal port `2443`, bukan 22.
- Isi `SSH_SSL_PORT=2443`, `SSH_SNI_HOST`, dan `SSH_SNI_PORT`.
