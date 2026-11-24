"""Comprobantes de pago enviados en el cuerpo multipart; no se conservan copias locales."""
from uuid import uuid4

LIMITE_IMAGEN = 4 * 1024 * 1024


def leer_comprobante(archivo, pago):
    if archivo is None or not archivo.filename:
        return None
    if pago != "realizado":
        raise ValueError("Indica que ya pagaste para adjuntar un comprobante.")
    contenido = archivo.read(LIMITE_IMAGEN + 1)
    if len(contenido) > LIMITE_IMAGEN:
        raise ValueError("La imagen supera los 4 MB.")
    if contenido.startswith(b"\x89PNG\r\n\x1a\n"):
        tipo, extension = "image/png", "png"
    elif contenido.startswith(b"\xff\xd8\xff"):
        tipo, extension = "image/jpeg", "jpg"
    elif contenido[:4] == b"RIFF" and contenido[8:12] == b"WEBP":
        tipo, extension = "image/webp", "webp"
    else:
        raise ValueError("Selecciona una imagen JPG, PNG o WebP.")
    return tipo, "comprobante." + extension, contenido


def multipart(campos, adjunto):
    separador = uuid4().hex
    partes = []
    for campo, valor in campos.items():
        partes.append(f'--{separador}\r\nContent-Disposition: form-data; name="{campo}"\r\n\r\n{valor}\r\n'.encode())
    tipo, nombre, contenido = adjunto
    partes.append(f'--{separador}\r\nContent-Disposition: form-data; name="attachment"; filename="{nombre}"\r\nContent-Type: {tipo}\r\n\r\n'.encode())
    partes.extend((contenido, f'\r\n--{separador}--\r\n'.encode()))
    return b"".join(partes), "multipart/form-data; boundary=" + separador
