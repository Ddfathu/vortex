#!/usr/bin/env python3
"""
TCP Multiplexer sederhana ala sslh.

Mendengarkan di SATU port publik, lalu mengintip beberapa byte pertama
dari koneksi masuk untuk menentukan protokolnya:

  - Byte pertama 0x16 (TLS handshake record)      -> diteruskan ke Stunnel (SSL)
  - Selain itu (dianggap teks/HTTP-WS handshake)  -> diteruskan ke ws-proxy (WS)

Berguna untuk platform seperti Railway yang cuma menyediakan SATU
TCP Proxy publik per service, sehingga SSH-SSL dan SSH-WS tetap bisa
diakses lewat port publik yang sama.
"""

import asyncio
import logging
import os
import signal
import sys

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = int(os.environ.get("MAIN_MUX_PORT", os.environ.get("PORT", "443")))

SSL_TARGET_HOST = os.environ.get("SSL_TARGET_HOST", "127.0.0.1")
SSL_TARGET_PORT = int(os.environ.get("SSL_TARGET_PORT", "2443"))  # stunnel internal

WS_TARGET_HOST = os.environ.get("WS_MUX_TARGET_HOST", "127.0.0.1")
WS_TARGET_PORT = int(os.environ.get("WS_MUX_TARGET_PORT", "8880"))  # ws-proxy internal

TLS_HANDSHAKE_BYTE = 0x16

logging.basicConfig(
    level=logging.INFO,
    format="[mux] %(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("mux")


async def pipe(src: asyncio.StreamReader, dst: asyncio.StreamWriter):
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
        log.debug("pipe error: %s", e)
    finally:
        try:
            dst.close()
        except Exception:
            pass


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")

    try:
        # Intip byte pertama tanpa membuang data (tetap kita simpan untuk diteruskan)
        first_byte = await reader.read(1)
        if not first_byte:
            writer.close()
            return

        if first_byte[0] == TLS_HANDSHAKE_BYTE:
            target_host, target_port, label = SSL_TARGET_HOST, SSL_TARGET_PORT, "SSL/stunnel"
        else:
            target_host, target_port, label = WS_TARGET_HOST, WS_TARGET_PORT, "WS"

        log.info("Koneksi %s dikenali sebagai %s -> %s:%s", peer, label, target_host, target_port)

        try:
            target_reader, target_writer = await asyncio.open_connection(target_host, target_port)
        except Exception as e:
            log.error("Gagal konek ke backend %s -> %s:%s : %s", label, target_host, target_port, e)
            writer.close()
            return

        # Kirim dulu byte pertama yang sudah kita intip, baru relay dua arah
        target_writer.write(first_byte)
        await target_writer.drain()

        await asyncio.gather(
            pipe(reader, target_writer),
            pipe(target_reader, writer),
        )

    except Exception as e:
        log.error("Error menangani klien %s: %s", peer, e)
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT)
    log.info(
        "Mux jalan di %s:%s -> SSL:%s:%s | WS:%s:%s",
        LISTEN_HOST, LISTEN_PORT,
        SSL_TARGET_HOST, SSL_TARGET_PORT,
        WS_TARGET_HOST, WS_TARGET_PORT,
    )
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
