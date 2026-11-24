"""Campos del participante y formato de la notificación de admisiones."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import re
from urllib.parse import urlsplit

DESTINATARIO = "williamhuacoto61@gmail.com"
CERTIFICACION = {"digital": ("Digital sin apostilla", 550), "fisico": ("Físico con apostilla", 700)}
PERFIL = {"alumni": "Plan Alumni", "externo": "Nuevo o externo"}


def fecha_bolivia():
    return datetime.now(timezone(timedelta(hours=-4))).date()


def texto(form, key, label, limite, obligatorio=True):
    valor = form.get(key, "").strip()
    if (obligatorio and not valor) or len(valor) > limite or (valor and not valor.isprintable()):
        raise ValueError("Revisa el campo «" + label + "».")
    return valor


def preparar(form, programa):
    if form.get("website") or not programa:
        raise ValueError("Selecciona un programa del catálogo.")
    nombre = texto(form, "name", "Nombre completo", 120)
    ci = texto(form, "ci", "CI del estudiante", 40)
    email = texto(form, "email", "Correo electrónico", 254)
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Escribe un correo electrónico válido.")
    sede = texto(form, "sede", "Sede", 120, False)
    asesor = texto(form, "asesor", "Persona que te atendió", 120, False)
    perfil, cert = form.get("perfil"), form.get("certificacion")
    if perfil not in PERFIL or cert not in CERTIFICACION or (perfil == "externo" and cert != "fisico"):
        raise ValueError("Revisa tu perfil y la modalidad de certificación.")
    modalidad, tarifa = CERTIFICACION[cert]
    hoy = fecha_bolivia()
    lineas = [
        ("Fecha de solicitud de inscripción (Bolivia)", hoy.isoformat()),
        ("Nombre del estudiante", nombre), ("CI del estudiante", ci),
        ("Correo del estudiante", email), ("Programa", programa["title"]),
        ("Perfil declarado", PERFIL[perfil]), ("Sede indicada", sede or "Por asignar"),
        ("Personal de sede indicado", asesor or "Por asignar"),
        ("Tipo de certificación", modalidad), ("Tarifa de certificación (Bs)", str(tarifa)),
    ]
    if perfil == "externo":
        lineas.append(("Referencia para externos (Bs)", "1.500 de formación + 700 de certificación = 2.200"))
    estado = form.get("pago")
    if estado == "realizado":
        try:
            fecha = date.fromisoformat(form.get("fecha_pago", ""))
            if fecha > hoy:
                raise ValueError
        except ValueError:
            raise ValueError("Indica una fecha de pago válida hasta el día de hoy.") from None
        original = form.get("monto", "").strip().replace(",", ".")
        if not re.fullmatch(r"\d{1,9}(\.\d{1,2})?", original):
            raise ValueError("Indica el monto pagado en bolivianos, con hasta dos decimales.")
        monto = Decimal(original)
        if monto <= 0:
            raise ValueError("El monto pagado debe ser mayor que cero.")
        enlace = texto(form, "comprobante", "Enlace al comprobante", 1500, False)
        if enlace:
            url = urlsplit(enlace)
            if url.scheme != "https" or not url.hostname or url.username or url.password or re.search(r"\s", enlace):
                raise ValueError("Usa un enlace HTTPS válido para el comprobante.")
        lineas += [
            ("Pago declarado", "Realizado · pendiente de verificación por la sede"),
            ("Fecha de pago", fecha.isoformat()), ("Monto declarado (Bs)", format(monto, ".2f")),
            ("Enlace al comprobante", enlace or "Pendiente de entrega"),
        ]
    elif estado == "pendiente":
        lineas.append(("Pago declarado", "Aún no realizado"))
    else:
        raise ValueError("Indica si ya realizaste el pago.")
    mensaje = form.get("message", "").strip()
    if len(mensaje) > 1500:
        raise ValueError("El mensaje puede tener hasta 1.500 caracteres.")
    if mensaje:
        lineas.append(("Mensaje", mensaje))
    return {
        "subject": "Solicitud de inscripción UPI · " + programa["title"],
        "reply_to": email,
        "campos": dict(lineas),
    }
