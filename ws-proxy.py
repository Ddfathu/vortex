#!/usr/bin/env python3
import asyncio
import base64
import hashlib
import logging
import os
import signal
import secrets
import sys

WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = int(os.environ.get("WS_PORT", "8880"))
TARGET_HOST = os.environ.get("WS_TARGET_HOST", "127.0.0.1")
TARGET_PORT = int(os.environ.get("WS_TARGET_PORT", "22"))
DEFAULT_RESPONSE = os.environ.get("WS_RESPONSE", "HTTP/1.1 101 Switching Protocols\r\n\r\n")

logging.basicConfig(level=logging.INFO, format="[ws-proxy] %(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ws-proxy")

def parse_headers(raw: bytes) -> dict:
    headers = {}
    try:
        for line in raw.decode(errors="ignore").split("\r\n")[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
    except Exception:
        pass
    return headers

def make_accept_key(ws_key: str) -> str:
    sha1 = hashlib.sha1((ws_key + WS_MAGIC).encode()).digest()
    return base64.b64encode(sha1).decode()

async def pipe(src: asyncio.StreamReader, dst: asyncio.StreamWriter, name="pipe"):
    try:
        while True:
            data = await src.read(65536)
            if not data:
                break
            dst.write(data)
            await dst.drain()
    except (ConnectionResetError, asyncio.IncompleteReadError):
        pass
    except Exception as e:
        log.debug("%s error: %s", name, e)
    finally:
        try:
            dst.close()
        except Exception:
            pass

async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    log.info("Koneksi masuk dari %s", peer)
    try:
        raw_headers = await reader.read(4096)
        if not raw_headers:
            writer.close()
            return

        headers = parse_headers(raw_headers)
        raw_text = raw_headers.decode(errors="ignore")
        raw_lower = raw_text.lower()

        is_ws = "upgrade: websocket" in raw_lower or headers.get("upgrade", "").lower() == "websocket"

        if is_ws:
            ws_key = headers.get("sec-websocket-key")
            if not ws_key:
                ws_key = base64.b64encode(secrets.token_bytes(16)).decode()
            response = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {make_accept_key(ws_key)}\r\n\r\n"
            )
            writer.write(response.encode())
        else:
            writer.write(DEFAULT_RESPONSE.encode())
        await writer.drain()

        try:
            target_reader, target_writer = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)
        except Exception as e:
            log.error("Gagal konek ke target %s:%s -> %s", TARGET_HOST, TARGET_PORT, e)
            writer.close()
            return

        # Jangan teruskan header HTTP ke SSH. Kalau ada data SSH mentah bocor, teruskan mulai dari SSH-.
        header_end = raw_headers.find(b"\r\n\r\n")
        payload = b""
        if header_end != -1:
            payload = raw_headers[header_end + 4:]
        if payload:
            idx = payload.find(b"SSH-")
            if idx >= 0:
                target_writer.write(payload[idx:])
                await target_writer.drain()

        await asyncio.gather(
            pipe(reader, target_writer, "client_to_ssh"),
            pipe(target_reader, writer, "ssh_to_client"),
        )
    except Exception as e:
        log.error("Error menangani klien %s: %s", peer, e)
    finally:
        try:
            writer.close()
        except Exception:
            pass
        log.info("Koneksi %s ditutup", peer)

async def main():
    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT)
    log.info("WS proxy jalan di %s:%s -> SSH %s:%s", LISTEN_HOST, LISTEN_PORT, TARGET_HOST, TARGET_PORT)
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
