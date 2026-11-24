import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

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
FORMSUBMIT = "https://formsubmit.co/" + DESTINATARIO


class SinRedireccion(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def form_id_publico():
    valor = os.getenv("FORMSUBMIT_ID", "").strip()
    return valor if re.fullmatch(r"[a-zA-Z0-9_-]{12,120}", valor) else ""


def catalogo(*, completo=False, muestra=False):
    telefono = re.sub(r"\D", "", os.getenv("WHATSAPP_NUMBER") or "59163257678")
    return render_template(
        "editorial.html", completo=completo, muestra=muestra, telefono=telefono,
        form_id=form_id_publico(), certificados=CERTIFICACION,
        temas=TEMAS, gemini_activo=not muestra and bool(os.getenv("GEMINI_API_KEY", "").strip()),
        form_url=os.getenv("PUBLIC_SITE_URL") or ("https://upiliam.vercel.app/" if muestra else request.url_root),
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
    return render_template("activar.html", origen=request.url_root)


@app.post("/activar-correo")
def solicitar_activacion():
    return enviar_formulario({"Motivo": "Verificación del formulario de admisiones."})


@app.get("/solicitud-recibida")
def recibida():
    return render_template("recibida.html")


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
    return jsonify(status="unconfirmed", message="Todavía no tenemos confirmación de tu solicitud. Tus datos siguen en el formulario. Consulta con admisiones antes de reenviar."), 502


@app.post("/consulta")
def inquiry():
    form = request.form
    try:
        mensaje = preparar(form, PROGRAMAS.get(form.get("program", type=int)))
        adjunto = leer_comprobante(request.files.get("attachment"), form.get("pago"))
    except ValueError as error:
        return jsonify(message=str(error)), 400

    payload = {
        **mensaje["campos"], "email": mensaje["reply_to"], "_subject": mensaje["subject"],
        "_template": "table",
    }
    referencia = form.get("intento", "")
    if re.fullmatch(r"[a-f0-9-]{36}", referencia):
        payload["Referencia de solicitud"] = referencia
    if adjunto:
        payload["Comprobante"] = "Imagen adjunta"
        if not form.get("comprobante"):
            payload.pop("Enlace al comprobante", None)
    return enviar_formulario(payload, adjunto)


@app.after_request
def permitir_catalogo_descargado(response):
    if request.path == "/consulta" and request.headers.get("Origin") == "null":
        response.headers["Access-Control-Allow-Origin"] = "null"
        response.vary.add("Origin")
    return response


def enviar_formulario(payload, adjunto=None):
    origen = os.getenv("PUBLIC_SITE_URL") or request.url_root
    recibo = origen.rstrip("/") + "/solicitud-recibida"
    payload.update(_url=origen, _next=recibo, _captcha="false")
    body, tipo = multipart(payload, adjunto) if adjunto else (urlencode(payload).encode(), "application/x-www-form-urlencoded")
    req = Request(FORMSUBMIT, data=body, headers={"Content-Type": tipo, "Referer": origen})
    try:
        with build_opener(SinRedireccion()).open(req, timeout=28) as response:
            if response.headers.get_content_type() == "application/json":
                return respuesta_proveedor(json.load(response), True)
            html = response.read(120000).decode("utf-8", "replace").lower()
            if "confirm your email" in html or "check your email to activate" in html:
                return respuesta_proveedor({"message": "activate"}, False)
    except HTTPError as error:
        with error:
            if error.code in (302, 303) and error.headers.get("Location") == recibo:
                return respuesta_proveedor({"success": True}, True)
            app.logger.warning("FormSubmit HTTP %s", error.code)
    except (URLError, OSError, ValueError):
        app.logger.warning("FormSubmit sin respuesta confirmada")
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
