"""Asistencia sobre el catálogo público de diplomados."""
import json
import os
from collections import OrderedDict
from pathlib import Path
from threading import Lock
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from flask import Blueprint, jsonify, request
from catalogo_vista import PROGRAMAS

once = Blueprint("once", __name__)
TEMAS = json.loads(Path(__file__).with_name("temarios.json").read_text(encoding="utf-8"))
CATALOGO = "\n".join(f"{p['id']}. {p['title']} ({p['area']}). {TEMAS[str(p['id'])]['resumen']}" for p in PROGRAMAS.values())
GUIA = """Eres ONCE, el asistente de admisiones de UPI Alumni. Responde en español cercano y concreto.
Orienta sobre diplomados, comparación de temarios, inscripción, costos, pago y uso de la web. Usa solo la guía y las fichas siguientes.
Hay 160 horas académicas, modalidad autogestionada en Moodle y 90 días desde la habilitación. Para certificarse hay que aprobar. Inscripción de campaña del 1 de noviembre al 31 de diciembre de 2026.
Alumni: beca de formación para alumnos seleccionados; la sede confirma elegibilidad. Certificación digital Bs 550 o física con apostilla Bs 700, pago adelantado. Externo: Bs 1.500 al inicio y Bs 700 al final por certificación física con apostilla.
Registro: elegir el diplomado, pulsar Me interesa, indicar nombre, CI y correo en el formulario, elegir perfil y certificado. Si ya pagó, fecha, monto y foto (JPG, PNG o WebP, hasta 4 MB) y/o enlace. Enviar solicitud la remite por FormSubmit a admisiones. La sede verifica el pago y habilita Moodle.
El botón «QR de pago» está en Plan Alumni y en Certificación y pago. El QR original corresponde a titulaciones. Se puede descargar. Después del pago, pulsa «Enviar comprobante por WhatsApp» y adjunta la imagen en el chat de admisiones. Para otros cobros o sedes, pedir confirmación a la sede. Nunca generes cuentas, QR ni enlaces de pago.
No recibes pagos ni tramitas inscripciones dentro del chat. No pidas datos personales ni comprobantes aquí. No inventes fechas, docentes, módulos o descuentos; remite al temario o admisiones si faltan datos.
En un máximo de 130 palabras, responde la pregunta. Si recomiendas un diplomado concreto, indica su ID; si no, usa 0. Para ofrecer el QR, el catálogo o la inscripción elige la acción apropiada. No incluyas URLs en el texto; el sitio añadirá los enlaces desde el catálogo.
Diplomados y contenido confirmado:
""" + CATALOGO

_visitas = OrderedDict()
_lock = Lock()


def cupo(ip):
    ahora = monotonic()
    with _lock:
        inicio, cantidad = _visitas.get(ip, (ahora, 0))
        if ahora - inicio >= 60:
            inicio, cantidad = ahora, 0
        if cantidad >= 15:
            return False
        _visitas[ip] = (inicio, cantidad + 1)
        _visitas.move_to_end(ip)
        if len(_visitas) > 2048:
            _visitas.popitem(last=False)
        return True


@once.post("/api/once")
def responder():
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return jsonify(modo="guia"), 503
    if (request.content_length or 0) > 18000:
        return jsonify(error="Consulta demasiado larga."), 413
    data = request.get_json(silent=True)
    turns = data.get("mensajes") if isinstance(data, dict) else None
    if not isinstance(turns, list) or not 1 <= len(turns) <= 7:
        return jsonify(error="Escribe una pregunta."), 400
    contents = []
    for turn in turns:
        if not isinstance(turn, dict) or turn.get("rol") not in ("user", "model"):
            return jsonify(error="Conversación no válida."), 400
        msg = turn.get("texto")
        limit = 650 if turn["rol"] == "user" else 1800
        if not isinstance(msg, str) or not 0 < len(msg.strip()) <= limit:
            return jsonify(error="Revisa el tamaño de tu pregunta."), 400
        contents.append({"role": turn["rol"], "parts": [{"text": msg.strip()}]})
    if contents[0]["role"] != "user" or contents[-1]["role"] != "user":
        return jsonify(error="Escribe una pregunta."), 400
    if not cupo(request.remote_addr or "local"):
        return jsonify(modo="guia", error="Límite temporal de consultas."), 429
    schema = {"type": "OBJECT", "properties": {
        "respuesta": {"type": "STRING"}, "programa": {"type": "INTEGER"},
        "accion": {"type": "STRING", "enum": ["ninguna", "catalogo", "registro", "qr"]}},
        "required": ["respuesta", "programa", "accion"]}
    selected = data.get("contexto")
    contexto = PROGRAMAS.get(selected) if type(selected) is int else None
    guia = GUIA + ("\nDiplomado seleccionado en la web: " + contexto["title"] if contexto else "")
    body = {"systemInstruction": {"parts": [{"text": guia}]}, "contents": contents,
            "generationConfig": {"temperature": 0.25, "maxOutputTokens": 1000,
                                 "responseMimeType": "application/json", "responseSchema": schema}}
    model = os.getenv("GEMINI_MODEL") or "gemini-3.1-flash-lite"
    req = Request("https://generativelanguage.googleapis.com/v1beta/models/" + quote(model, safe="") + ":generateContent",
                  data=json.dumps(body).encode(), headers={"Content-Type":"application/json", "x-goog-api-key":key})
    try:
        with urlopen(req, timeout=15) as res:
            parts = json.load(res)["candidates"][0]["content"]["parts"]
        parsed = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
        answer = parsed["respuesta"]
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("Respuesta vacía.")
        program = parsed.get("programa")
        action = parsed.get("accion")
        return jsonify(modo="gemini", respuesta=answer.strip()[:1800],
                       programa=program if type(program) is int and program in PROGRAMAS else 0,
                       accion=action if action in ("catalogo", "registro", "qr") else "ninguna")
    except HTTPError as exc:
        details = exc.read(8192).decode("utf-8", errors="replace").lower()
        if any(s in details for s in ("api_key_invalid", "api key not valid", "api key expired", "api key was reported as leaked")):
            motivo = "Google rechazó la clave de Gemini."
        else:
            motivo = {401: "Google requiere una clave válida.", 403: "Google denegó el acceso al proyecto o modelo.",
                      404: "Google no encontró el modelo configurado.", 429: "Se alcanzó un límite de uso de Gemini.",
                      400: "Google rechazó la solicitud o su configuración."}.get(exc.code, "Google devolvió un error de servicio.")
        return jsonify(modo="guia", error=f"{motivo} (HTTP {exc.code})"), 503
    except (URLError, OSError):
        return jsonify(modo="guia", error="El servidor no logró conectarse a Gemini a tiempo."), 503
    except (KeyError, IndexError, ValueError, TypeError, AttributeError):
        return jsonify(modo="guia", error="Gemini devolvió una respuesta que ONCE no pudo leer."), 503
