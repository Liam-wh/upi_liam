import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request, send_from_directory

from catalogo_vista import AREAS, AREAS_PORTADA, DESTACADOS, PROGRAMAS, RESTO, SLIDES
from inscripcion import CERTIFICACION, DESTINATARIO, preparar
from adjuntos import LIMITE_IMAGEN, leer_comprobante, multipart
from once import TEMAS, once

# Formato local: GEMINI_API_KEY=valor. El entorno del servidor tiene prioridad.
env_local = Path(__file__).with_name(".env")
if not os.environ.get("GEMINI_API_KEY") and env_local.is_file():
    for linea in env_local.read_text(encoding="utf-8-sig").splitlines():
        nombre, separador, valor = linea.partition("=")
        if separador and nombre.strip() == "GEMINI_API_KEY":
            os.environ["GEMINI_API_KEY"] = valor.strip().strip("\"'")
            break

app = Flask(__name__, static_folder="public", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = LIMITE_IMAGEN + 65536
app.register_blueprint(once)
FORMSUBMIT = "https://formsubmit.co/ajax/" + DESTINATARIO


def catalogo(*, completo=False, muestra=False):
    telefono = re.sub(r"\D", "", os.getenv("WHATSAPP_NUMBER") or "59163257678")
    return render_template(
        "editorial.html", completo=completo, muestra=muestra, telefono=telefono,
        destinatario=DESTINATARIO, certificados=CERTIFICACION,
        temas=TEMAS, gemini_activo=not muestra and bool(os.getenv("GEMINI_API_KEY", "").strip()),
        form_url=os.getenv("PUBLIC_SITE_URL") or request.url_root,
        programas=DESTACADOS + RESTO, slides=SLIDES, areas=AREAS,
        areas_portada=AREAS_PORTADA, destacados=DESTACADOS,
    )


@app.get("/")
def editorial():
    return catalogo()


@app.get("/todos")
def home():
    return catalogo(completo=True)


@app.get("/activar-correo")
def activar_correo():
    return render_template("activar.html", destinatario=DESTINATARIO, origen=request.url_root)


@app.get("/solicitud-recibida")
def recibida():
    return render_template("recibida.html", destinatario=DESTINATARIO)


@app.get("/qr-titulaciones/descargar")
def descargar_qr():
    return send_from_directory(app.static_folder, "media/qr-titulaciones.png", mimetype="image/png",
                               as_attachment=True, download_name="QR-Titulaciones-ESAM.png")


def respuesta_proveedor(data, http_ok):
    if isinstance(data, dict):
        mensaje = str(data.get("message", "")).lower()
        if any(texto in mensaje for texto in ("activat", "confirm your email", "verify your email")):
            return jsonify(status="activation_pending", message="FormSubmit solicita verificar esta dirección del formulario. Puedes comunicarlo a admisiones por WhatsApp."), 202
        if http_ok and str(data.get("success", "")).lower() == "true":
            return jsonify(status="accepted", message="FormSubmit aceptó la solicitud para su envío.")
    return jsonify(status="unconfirmed", message="FormSubmit no confirmó la recepción. Conservamos los campos para que puedas revisar o reintentar la solicitud."), 502


@app.post("/consulta")
def inquiry():
    form = request.form
    try:
        mensaje = preparar(form, PROGRAMAS.get(form.get("program", type=int)))
        adjunto = leer_comprobante(request.files.get("attachment"), form.get("pago"))
    except ValueError as error:
        return jsonify(message=str(error)), 400

    origen = os.getenv("PUBLIC_SITE_URL") or request.url_root
    payload = {
        **mensaje["campos"], "email": mensaje["reply_to"], "_subject": mensaje["subject"],
        "_template": "table", "_url": origen,
    }
    referencia = form.get("intento", "")
    if re.fullmatch(r"[a-f0-9-]{36}", referencia):
        payload["Referencia de solicitud"] = referencia
    if adjunto:
        payload["Comprobante"] = "Imagen adjunta"
        if not form.get("comprobante"):
            payload.pop("Enlace al comprobante", None)
        body, tipo = multipart(payload, adjunto)
    else:
        body, tipo = json.dumps(payload).encode(), "application/json"
    req = Request(
        FORMSUBMIT, data=body,
        headers={"Content-Type": tipo, "Accept": "application/json",
                 "User-Agent": "UPI-Alumni/1.0", "Referer": origen},
    )
    try:
        with urlopen(req, timeout=14) as response:
            return respuesta_proveedor(json.load(response), True)
    except HTTPError as error:
        try:
            return respuesta_proveedor(json.load(error), False)
        except (ValueError, OSError):
            return respuesta_proveedor(None, False)
    except (URLError, OSError, ValueError):
        return respuesta_proveedor(None, False)


if __name__ == "__main__":
    import sys
    import webbrowser
    from threading import Thread
    from werkzeug.serving import make_server

    try:
        servidor = make_server("127.0.0.1", 5000, app, threaded=True)
    except SystemExit:
        # Un segundo catálogo puede usar otro puerto local sin cerrar la primera instancia.
        servidor = make_server("127.0.0.1", 0, app, threaded=True)
    base = f"http://127.0.0.1:{servidor.server_port}"
    print(f"Catálogo: {base}/\nActivación: {base}/activar-correo\nMantén abierta esta ventana.", flush=True)
    pagina = base + ("/activar-correo" if "--activar" in sys.argv else "/")
    Thread(target=webbrowser.open, args=(pagina,), daemon=True).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
