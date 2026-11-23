"""Levanta el juego de catástrofes hospitalarias (carpeta juego/) en un servidor local.

    python juego.py                 # http://localhost:8080 y abre el navegador
    python juego.py --puerto 9000   # otro puerto
    python juego.py --no-abrir      # sin abrir el navegador

Solo usa la biblioteca estándar de Python (no requiere pip install).
"""
from __future__ import annotations

import argparse
import functools
import http.server
import threading
import webbrowser
from pathlib import Path

CARPETA = Path(__file__).parent / "juego"


def servir(puerto: int = 8080, abrir: bool = True) -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(CARPETA))
    handler.log_message = lambda *a, **k: None  # consola limpia
    servidor = None
    for candidato in range(puerto, puerto + 20):  # si está ocupado, prueba los siguientes
        try:
            servidor = http.server.ThreadingHTTPServer(("127.0.0.1", candidato), handler)
            break
        except OSError:
            continue
    if servidor is None:
        raise SystemExit(f"Los puertos {puerto}-{puerto + 19} están ocupados. Usa: python juego.py --puerto N")
    if candidato != puerto:
        print(f"El puerto {puerto} está ocupado; usando {candidato}.")
    puerto = candidato
    url = f"http://localhost:{puerto}"
    print(f"Juego de urgencias en {url}  (Ctrl+C para detener)")
    if abrir:
        threading.Timer(0.6, webbrowser.open, args=(url,)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--puerto", type=int, default=8080)
    p.add_argument("--no-abrir", action="store_true")
    a = p.parse_args()
    servir(a.puerto, not a.no_abrir)
