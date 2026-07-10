#!/usr/bin/env python3
"""
WebSocket <-> SSH proxy (Mega-Complex Protector Edition).

Kombinasi seluruh kasta tertinggi manipulasi jaringan:
1. ENHANCED PAYLOAD MATCHING: Penyaring fragmentasi & pemotong teks sampah (BMOVE/PATCH).
2. BLIND PREMIUM HANDSHAKE: Kebal respon 301 Moved Permanently dari operator.
3. TURBO ENGINE: Mematikan Algoritma Nagle (TCP_NODELAY) demi ping super responsif.
4. MONSTER BUFFER: Alokasi 512KB RAM Kernel untuk download/upload gajah.
5. SIGNAL ARMOR: Mengunci socket hingga 2,5 menit saat HP kehilangan sinyal.
6. APPLICATION HEARTBEAT: Menyemburkan frame biner \x89\x00 tiap 5 detik agar HTTP Custom anti-DC.
"""

import asyncio
import base64
import hashlib
import logging
import os
import signal
import sys
import secrets
import socket

WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Konfigurasi Environment / Default Railway
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = int(os.environ.get("WS_PORT", "8880"))
TARGET_HOST = os.environ.get("WS_TARGET_HOST", "127.0.0.1")
TARGET_PORT = int(os.environ.get("WS_TARGET_PORT", "22"))

logging.basicConfig(
    level=logging.INFO,
    format="[mega-proxy] %(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("mega-proxy")


def parse_headers(raw: bytes) -> dict:
    """Mesin penganalisis header HTTP tingkat tinggi."""
    headers = {}
    try:
        header_part = raw.split(b"\r\n\r\n", 1)[0]
        lines = header_part.decode(errors="ignore").split("\r\n")
        for line in lines[1:]:
            if not line:
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
    except Exception as e:
        log.debug("Gagal analisa header: %s", e)
    return headers


def make_accept_key(ws_key: str) -> str:
    """Pembuat kunci enkripsi handshake WebSocket."""
    sha1 = hashlib.sha1((ws_key + WS_MAGIC).encode()).digest()
    return base64.b64encode(sha1).decode()


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    log.info("Koneksi masuk dari client: %s", peer)

    try:
        # Membaca header awal dengan kapasitas muat besar (Anti-Overload)
        raw_headers = await reader.read(8192)
        if not raw_headers:
            writer.close()
            return

        headers = parse_headers(raw_headers)
        raw_text_lower = raw_headers.decode(errors="ignore").lower()

        # Ekstraksi Sec-WebSocket-Key secara berlapis (Sangat Kompleks)
        ws_key = headers.get("sec-websocket-key")
        if not ws_key and "sec-websocket-key:" in raw_text_lower:
            try:
                for line in raw_headers.decode(errors="ignore").split("\r\n"):
                    if "sec-websocket-key" in line.lower():
                        ws_key = line.split(":", 1)[1].strip()
                        break
            except Exception:
                pass

        # Autopilot Key Generator jika client mengirim format rusak
        if not ws_key:
            ws_key = base64.b64encode(secrets.token_bytes(16)).decode()

        # Menembakkan proteksi Jabat Tangan 101 (Mengunci HP & Kebal Sensor 301)
        accept_key = make_accept_key(ws_key)
        response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_key}\r\n"
        )
        if "sec-websocket-protocol" in headers:
            response += f"Sec-WebSocket-Protocol: {headers['sec-websocket-protocol']}\r\n"
        response += "\r\n"
        
        writer.write(response.encode())
        await writer.drain()

        # Menghubungkan gerbang ke Dropbear SSH internal
        try:
            target_reader, target_writer = await asyncio.open_connection(
                TARGET_HOST, TARGET_PORT
            )
        except Exception as e:
            log.error("Gagal interkoneksi ke Dropbear Backend -> %s", e)
            writer.close()
            return

        # Suntik TCP_NODELAY ke socket target SSH
        target_sock = target_writer.get_extra_info('socket')
        if target_sock is not None:
            target_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

        # =====================================================================
        # JALUR UPLOAD (HP -> SERVER): FITUR PENYARING PAYLOAD ENHANCED (ASLI)
        # =====================================================================
        async def pipe_client_to_ssh(src: asyncio.StreamReader, dst: asyncio.StreamWriter):
            first_packet = True
            buffer_data = b""
            try:
                while True:
                    data = await src.read(65536)
                    if not data:
                        break
                    
                    if first_packet:
                        buffer_data += data
                        # Logika pengumpul buffer fragmentasi (Jantung Versi Pertama)
                        if b"SSH-" in buffer_data:
                            idx = buffer_data.find(b"SSH-")
                            clean_data = buffer_data[idx:]
                            
                            dst.write(clean_data)
                            await dst.drain()
                            
                            first_packet = False
                            buffer_data = b""
                        else:
                            if len(buffer_data) > 65536: 
                                log.warning("Payload sampah terlalu panjang, mereset buffer...")
                                buffer_data = b""
                            continue
                    else:
                        dst.write(data)
                        await dst.drain()
            except Exception as e:
                log.debug("Kendala pada jalur upload: %s", e)
            finally:
                try:
                    dst.close()
                except Exception:
                    pass

        # =====================================================================
        # JALUR DOWNSTREAM (SERVER -> HP): INJEKSI ULTRA PERANGKO HEARTBEAT
        # =====================================================================
        async def pipe_ssh_to_client(src: asyncio.StreamReader, dst: asyncio.StreamWriter):
            try:
                while True:
                    try:
                        # Pengecekan keaktifan traffic selama 5 detik
                        data = await asyncio.wait_for(src.read(65536), timeout=5.0)
                        if not data:
                            break
                        dst.write(data)
                        await dst.drain()
                    except asyncio.TimeoutError:
                        # Sinyal drop? Suntik instan bingkai biner WebSocket Ping ke HTTP Custom
                        dst.write(b"\x89\x00")
                        await dst.drain()
            except Exception as e:
                log.debug("Kendala pada jalur downstream: %s", e)
            finally:
                try:
                    dst.close()
                except Exception:
                    pass

        # Jalankan kedua pipa data secara paralel asinkron
        await asyncio.gather(
            pipe_client_to_ssh(reader, target_writer),
            pipe_ssh_to_client(target_reader, writer),
        )

    except Exception as e:
        log.error("Error penanganan client %s: %s", peer, e)
    finally:
        try:
            writer.close()
        except Exception:
            pass
        log.info("Sesi koneksi %s selesai ditangani", peer)


async def main():
    def configure_socket(writer_spec):
        sock = writer_spec.get_extra_info('socket')
        if sock is not None:
            # 1. TURBO OPTIMIZATION: Matikan Algoritma Nagle
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            
            # 2. MONSTER BUFFER CAPACITY: Buka keran transmisi 512 KB
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 524288)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 524288)
            
            # 3. KERNEL SIGNAL ARMOR: Ketahanan Sinyal Drop (Toleransi 2,5 Menit)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            try:
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)
                keepcnt_opt = getattr(socket, 'TCP_KEEPCNT', 6)
                sock.setsockopt(socket.IPPROTO_TCP, keepcnt_opt, 12)
            except Exception as e:
                log.debug("Gagal menyuntikkan keepalive kernel Linux: %s", e)

    async def client_connected_cb(reader, writer):
        configure_socket(writer)
        await handle_client(reader, writer)

    # Membuka gerbang server dengan batasan limit 32KB
    server = await asyncio.start_server(client_connected_cb, LISTEN_HOST, LISTEN_PORT, limit=32768)
    log.info("==========================================================================")
    log.info("WS PROXY RUNNING -> BACKEND DROPBEAR (MEGA-COMPLEX PROTECTOR ACTIVE)")
    log.info("==========================================================================")
    
    async with server:
        await server.serve_forever()


def handle_sigterm(*_):
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, handle_sigterm)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
