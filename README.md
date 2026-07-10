# VORTEX PROJECT

VORTEX PROJECT adalah panel SSH WebSocket untuk Railway dengan dukungan Cloudflare Tunnel / Zero Trust.

Project ini dibuat agar:

- Dashboard bisa dibuka lewat domain Railway.
- SSH WebSocket bisa dipakai lewat domain Cloudflare Tunnel.
- User SSH tetap tersimpan walaupun Railway restart.
- Konfigurasi mudah dipakai dari HP.

---

## Fitur Utama

- Dashboard web Railway
- SSH User Manager
- Tambah, lihat, dan hapus user SSH
- Dropbear SSH internal
- WebSocket proxy untuk SSH
- Cloudflare Tunnel support
- Persistent user database di `/data/users.txt`
- Banner connect custom untuk DarkTunnel / HTTP Custom
- Banner console setelah login SSH

---

## Cara Deploy ke Railway

1. Upload project ini ke GitHub.
2. Buka Railway.
3. Pilih **New Project**.
4. Pilih **Deploy from GitHub**.
5. Tunggu build selesai.
6. Buka tab **Networking**.
7. Klik **Generate Domain**.
8. Buka domain Railway untuk masuk dashboard.

Contoh:

```txt
https://nama-project.up.railway.app
```

---

## Railway Volume

Agar user SSH tidak hilang saat restart, pasang Railway Volume.

Mount path:

```txt
/data
```

User SSH akan disimpan di:

```txt
/data/users.txt
```

---

## Variables Railway

Isi variable berikut di Railway.

```env
CF_TUNNEL_TOKEN=token_cloudflare_kamu
SSH_USER=vortex
SSH_PASSWORD=vortex123
DATA_DIR=/data
SSH_PORT=22
WS_INTERNAL_PORT=8880
PUBLIC_HOST=domain-ssh-kamu
SSH_PUBLIC_HOST=domain-ssh-kamu
SSH_PUBLIC_PATH=/
XRAY_PUBLIC_HOST=domain-xray-kamu
SNI_PUBLIC_HOST=domain-railway-kamu
```

Contoh:

```env
PUBLIC_HOST=vortex.domainkamu.com
SSH_PUBLIC_HOST=vortex.domainkamu.com
SSH_PUBLIC_PATH=/
XRAY_PUBLIC_HOST=domain-xray-kamu
SNI_PUBLIC_HOST=domain-railway-kamu
```

---

## Cloudflare Zero Trust

Untuk SSH WebSocket, buat Public Hostname di Cloudflare Zero Trust.

Setting:

```txt
Hostname : vortex.domainkamu.com
Service  : HTTP
URL      : localhost:8880
```

Domain inilah yang dipakai di DarkTunnel / HTTP Custom.

---

## Dashboard

Dashboard dibuka lewat domain Railway:

```txt
https://nama-project.up.railway.app
```

Di dashboard kamu bisa:

- Melihat status server
- Menambah user SSH
- Melihat daftar user SSH
- Menghapus user SSH
- Mengambil config SSH dari tombol Config

Admin password tidak dipakai di dashboard versi ini.

---

## Format SSH WebSocket

Gunakan domain Cloudflare Tunnel, bukan domain Railway.

Contoh:

```txt
Host/SNI : vortex.domainkamu.com
Port     : 443
TLS      : ON
Path     : /
```

Payload:

```txt
GET / HTTP/1.1[crlf]Host: [host][crlf]Upgrade: websocket[crlf][crlf]
```

Atau versi lengkap:

```txt
GET / HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]Upgrade: websocket[crlf]User-Agent: [ua][crlf][crlf]
```

---

## Alur Kerja

```txt
DarkTunnel / HTTP Custom
        ↓
Domain Cloudflare Tunnel
        ↓
localhost:8880
        ↓
WS Proxy
        ↓
Dropbear SSH
        ↓
User SSH
```

Dashboard tetap lewat:

```txt
Domain Railway → Dashboard Web
```

SSH tetap lewat:

```txt
Domain Cloudflare Tunnel → localhost:8880
```

---

## CLI di Railway Console

Kalau masuk Railway Console, kamu bisa pakai:

```bash
menu
addssh
listssh
delssh
vortex-clean-expired
showbanner
```

Fungsi:

```txt
menu                 buka menu SSH
addssh               tambah user SSH
listssh              lihat user SSH
delssh               hapus user SSH
vortex-clean-expired hapus user expired
showbanner           lihat banner connect
```

---

## Banner

Ada dua jenis banner:

### 1. Banner Connect

Banner ini tampil di DarkTunnel / HTTP Custom pada bagian:

```txt
Server Message
```

Banner ini berasal dari:

```txt
/etc/dropbear_banner
```

### 2. Banner Console

Banner ini tampil setelah berhasil login SSH ke console.

Banner ini berasal dari:

```txt
/etc/profile.d/vortexbanner.sh
```

Railway Console tidak otomatis menampilkan banner SSH, karena Railway Console bukan login SSH client.

---

## Catatan Penting

- Domain Railway dipakai untuk dashboard.
- Domain Cloudflare Tunnel dipakai untuk SSH WebSocket.
- Jangan arahkan SSH Tunnel ke `localhost:8080`.
- Untuk SSH Tunnel gunakan `localhost:8880`.
- User SSH disimpan di `/data/users.txt`.
- Pasang Railway Volume ke `/data` agar user tidak hilang.
- Gunakan project ini hanya untuk server milik sendiri dan penggunaan yang sah.

---

## Ringkasan Setting

Dashboard:

```txt
Railway Domain → Dashboard
```

SSH WebSocket:

```txt
Cloudflare Zero Trust
vortex.domainkamu.com → HTTP → localhost:8880
```

DarkTunnel / HTTP Custom:

```txt
Host : vortex.domainkamu.com
Port : 443
TLS  : ON
SNI  : vortex.domainkamu.com
```

Payload:

```txt
GET / HTTP/1.1[crlf]Host: [host][crlf]Upgrade: websocket[crlf][crlf]
```

---

## Branding

Project ini menggunakan branding:

```txt
VORTEX PROJECT
```


## Delete User Protection

Tombol hapus user di dashboard sekarang wajib memasukkan `ADMIN_PASS`.

Tambahkan variable Railway:

```env
ADMIN_PASS=password_hapus_yang_kuat
```

Kalau `ADMIN_PASS` tidak diisi, sistem memakai fallback dari `SSH_PASSWORD`, lalu `vortex123`.

Tambah user, list user, dan config tetap tidak butuh admin password. Password hanya diminta saat hapus user.


## Xray Public Host

Untuk VLESS/Trojan lewat Cloudflare Tunnel, isi variable:

```env
XRAY_PUBLIC_HOST=vortex.nizwara.qzz.io
```

Opsional kalau ingin domain VLESS dan Trojan dipisah:

```env
VLESS_PUBLIC_HOST=vless.nizwara.qzz.io
TROJAN_PUBLIC_HOST=trojan.nizwara.qzz.io
```

Kalau `VLESS_PUBLIC_HOST` dan `TROJAN_PUBLIC_HOST` kosong, keduanya otomatis ikut `XRAY_PUBLIC_HOST`.

Setting Zero Trust untuk Xray:

```txt
Hostname : vortex.nizwara.qzz.io
Service  : HTTP
URL      : localhost:8080
```

SSH tetap pakai:

```txt
SSH_PUBLIC_HOST=domain-ssh-kamu
SSH_PUBLIC_PATH=/
```


## WS dan SNI Generator

Generator sekarang punya pilihan:

- `VLESS WS`
- `Trojan WS`
- `VLESS SNI`
- `Trojan SNI`

Logika domain:

```txt
WS  memakai XRAY_PUBLIC_HOST / VLESS_PUBLIC_HOST / TROJAN_PUBLIC_HOST
SNI memakai SNI_PUBLIC_HOST
```

Contoh variable:

```env
XRAY_PUBLIC_HOST=vortex.nizwara.qzz.io
SNI_PUBLIC_HOST=nama-project.up.railway.app
```

Kalau `SNI_PUBLIC_HOST` kosong, generator SNI memakai domain tempat dashboard dibuka. Jadi kalau dashboard dibuka dari domain Railway, SNI otomatis pakai domain Railway.

Catatan:
- WS cocok untuk domain Argo/Zero Trust.
- SNI tetap WebSocket, tetapi memakai domain Railway / SNI_PUBLIC_HOST karena itu yang sudah connect di client kamu.

## SSH WS dan SSH SNI

Daftar user SSH sekarang punya dua tombol config:

- `SSH WS` memakai `SSH_PUBLIC_HOST` dan `SSH_PUBLIC_PATH`.
- `SSH SNI` memakai `SNI_PUBLIC_HOST`.

Contoh variable:

```env
SSH_PUBLIC_HOST=ssh-ws.nizwara.qzz.io
SSH_PUBLIC_PATH=/
SNI_PUBLIC_HOST=nama-project.up.railway.app
```

Logika:
- SSH WS cocok untuk domain Cloudflare Tunnel / Argo.
- SSH SNI cocok untuk domain bawaan Railway yang sudah connect di client kamu.


## SSH SNI Railway TCP Proxy

Untuk SSH SNI murni di Railway, gunakan fitur **TCP Proxy** di tab Networking.

Contoh hasil Railway TCP Proxy:

```txt
hayabusa.proxy.rlwy.net:31711
```

Isi variable Railway:

```env
SSH_SNI_HOST=hayabusa.proxy.rlwy.net
SSH_SNI_PORT=31711
```

Format config SSH SNI akan menjadi:

```txt
hayabusa.proxy.rlwy.net:31711@username:password
```

Catatan:
- SSH WS tetap memakai `SSH_PUBLIC_HOST` dan Cloudflare Tunnel.
- SSH SNI memakai TCP Proxy Railway, bukan domain Railway `:443`.
- Di Railway, buat TCP Proxy untuk port internal `22`.


## No Default SSH User

Versi ini tidak membuat akun SSH bawaan otomatis.

Artinya kalau variable berikut tidak diisi:

```env
SSH_USER=
SSH_PASSWORD=
```

maka tidak ada user default seperti `vortex:vortex123`.

User SSH dibuat lewat:

- Dashboard → SSH Manager
- Railway Console → `addssh`

Kalau tetap ingin akun default saat deploy pertama, isi manual:

```env
SSH_USER=vortex
SSH_PASSWORD=password_kuat
```

Kalau tidak ingin akun default, hapus saja dua variable itu.


## Variables Final yang Disarankan

Minimal:

```env
CF_TUNNEL_TOKEN=token_cloudflare_kamu
DATA_DIR=/data
SSH_PORT=22
WS_INTERNAL_PORT=8880
ADMIN_PASS=Vortex

PUBLIC_HOST=ssh-ws.nizwara.qzz.io
SSH_PUBLIC_HOST=ssh-ws.nizwara.qzz.io
SSH_PUBLIC_PATH=/
```

Tambahan Xray WS:

```env
XRAY_PUBLIC_HOST=vortex.nizwara.qzz.io
```

Tambahan VLESS/Trojan SNI:

```env
SNI_PUBLIC_HOST=vorte-x-production.up.railway.app
```

Tambahan SSH SNI TCP Proxy:

```env
SSH_SNI_HOST=hayabusa.proxy.rlwy.net
SSH_SNI_PORT=31711
```

Opsional akun default:

```env
SSH_USER=vortex
SSH_PASSWORD=password_kuat
```

Kalau `SSH_USER` dan `SSH_PASSWORD` tidak diisi, user default tidak dibuat.


## Pakai File `vortex.env`

Versi ini bisa membaca variable langsung dari file:

```txt
/app/vortex.env
/app/.env
/data/vortex.env
```

File yang paling mudah diedit dari GitHub:

```txt
vortex.env
```

Cara pakai:

1. Buka file `vortex.env`.
2. Edit domain, token, dan port sesuai punyamu.
3. Commit ke GitHub.
4. Railway akan redeploy.
5. Script otomatis membaca isi `vortex.env`.

Urutan prioritas:

```txt
Railway Variables  = paling kuat
/data/vortex.env   = dibaca kalau variable belum ada
/app/vortex.env    = dibaca kalau variable belum ada
/app/.env          = dibaca kalau variable belum ada
```

Jadi kalau variable sudah kamu isi di Railway, isi `vortex.env` tidak akan menimpa variable Railway.

Contoh isi `vortex.env`:

```env
CF_TUNNEL_TOKEN=token_cloudflare_kamu
DATA_DIR=/data
SSH_PORT=22
WS_INTERNAL_PORT=8880
ADMIN_PASS=Vortex

PUBLIC_HOST=ssh-ws.nizwara.qzz.io
SSH_PUBLIC_HOST=ssh-ws.nizwara.qzz.io
SSH_PUBLIC_PATH=/

XRAY_PUBLIC_HOST=vortex.nizwara.qzz.io
SNI_PUBLIC_HOST=vorte-x-production.up.railway.app

SSH_SNI_HOST=hayabusa.proxy.rlwy.net
SSH_SNI_PORT=31711
```

Catatan keamanan:
Jangan simpan `CF_TUNNEL_TOKEN` asli di repo publik. Kalau repo publik, lebih aman token tetap di Railway Variables.


## Railway Healthcheck Fix

Versi ini menonaktifkan `healthcheckPath` dari `railway.toml`.

Alasannya:
- Build Docker sebenarnya sukses.
- Railway sebelumnya mengecek `/health` dalam 30 detik.
- Kalau server belum siap saat dicek, deployment ditandai merah walaupun service sebenarnya bisa jalan setelah start.

Setelah deploy versi ini, Railway tidak lagi gagal hanya karena healthcheck `/health`.


## SSH Config Buttons Fix

Daftar user SSH sekarang menampilkan dua tombol:

- `SSH WS` untuk config Cloudflare Tunnel / Argo.
- `SSH SNI` untuk config Railway TCP Proxy.

Saat user baru dibuat, output langsung menampilkan dua format sekaligus: SSH WS dan SSH SNI.

Contoh SSH SNI:

```txt
nozomi.proxy.rlwy.net:25845@username:password
```


## Compact User Action Buttons

Tombol aksi di tabel SSH Manager sudah diperkecil agar nyaman di HP:

- `SSH WS`
- `SSH SNI`
- `Delete`

Tombol sekarang lebih pendek, lebih kecil, dan tidak terlalu makan tinggi layar.


## Xray SNI WS Format Fix

VLESS SNI dan Trojan SNI sekarang tetap memakai format WebSocket.

Logika baru:

```txt
VLESS WS   = domain XRAY_PUBLIC_HOST + type=ws + path /vless-vortex
VLESS SNI  = domain SNI_PUBLIC_HOST  + type=ws + path /vless-vortex

Trojan WS  = domain XRAY_PUBLIC_HOST + type=ws + path /trojan-vortex
Trojan SNI = domain SNI_PUBLIC_HOST  + type=ws + path /trojan-vortex
```

Jadi SNI di sini bukan `type=tcp`, tetapi tetap WS dengan domain berbeda.


## SSH WS dan SSH SNI Banner Sama

Banner connect sekarang dipaksa sama untuk dua jalur:

```txt
SSH WS  -> ws-proxy -> Dropbear
SSH SNI -> Railway TCP Proxy -> Dropbear
```

Sumber banner utama:

```txt
/etc/dropbear_banner
```

Fallback untuk client yang membaca banner lain:

```txt
/etc/issue.net
/etc/motd
```

Jadi tampilan connect SSH WS dan SSH SNI tidak berbeda lagi.


## SSH SNI Connect Fix: Stunnel 2443

SSH SNI sekarang memakai stunnel SSL wrapper.

Port internal:

```txt
22   = Dropbear SSH plain
2443 = SSH SSL/SNI via stunnel
8880 = SSH WS proxy
8080 = Dashboard
```

Untuk SSH SNI di Railway:

1. Buka `Networking`.
2. Klik `Add TCP Proxy`.
3. Pilih internal port:

```txt
2443
```

4. Railway akan memberi endpoint seperti:

```txt
nozomi.proxy.rlwy.net:25845
```

5. Isi variable:

```env
SSH_SSL_PORT=2443
SSH_SNI_HOST=nozomi.proxy.rlwy.net
SSH_SNI_PORT=25845
```

Catatan:
- Kalau TCP Proxy diarahkan ke port `22`, itu SSH direct/plain, bukan SSL/SNI.
- Untuk mode SSH SNI/SSL di client, pakai TCP Proxy port internal `2443`.


## SSH_SSL_PORT Dashboard Fix

Memperbaiki error:

```txt
SSH_SSL_PORT is not defined
```

Sekarang dashboard aman walaupun variable `SSH_SSL_PORT` belum kebaca, karena default otomatis:

```env
SSH_SSL_PORT=2443
```


## SSH_SSL_PORT Hotfix V2

Memperbaiki error dashboard:

```txt
SSH_SSL_PORT is not defined
```

Perbaikan:
- `SSH_SSL_PORT` didefinisikan global di `server.js`.
- Dashboard memakai nilai aman `sshSslPort`.
- Default tetap `2443`.
- `SSH_PORT` sekarang membaca variable `SSH_PORT` dengan benar.
