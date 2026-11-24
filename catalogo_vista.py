"""Datos de presentación del catálogo. Los títulos y los brochures proceden de catalogo.json."""
import json
from pathlib import Path

# Selección editorial de portada. El área original se conserva en el catálogo completo.
SELECCION = {
    1: ("IA y tecnología", "Agentes digitales para marketing", "Explora cómo se crean agentes digitales para automatizar tareas de marketing."),
    2: ("Diseño", "Diseño de microcredenciales", "Conecta el diseño de microcredenciales con las necesidades de la educación digital."),
    12: ("Diseño", "Diseño de encuestas e investigación de mercados", "Descubre cómo formular preguntas para comprender mejor un mercado."),
    4: ("IA y tecnología", "Ciberseguridad de datos", "Estudia cómo proteger la información en entornos digitales."),
    15: ("Negocios", "Gerencia estratégica y finanzas", "Relaciona las decisiones financieras con la gestión administrativa de una empresa."),
    19: ("Negocios", "Liderazgo y habilidades directivas", "Explora el liderazgo y el desarrollo de habilidades para dirigir equipos."),
}
TONOS = {
    "Tecnología e IA": "mint", "Educación": "lilac", "Salud": "mint",
    "Medioambiente": "mint", "Derecho": "lilac", "Finanzas": "apricot",
    "Gestión empresarial": "apricot", "Marketing y comunicación": "lilac",
}
PROGRAMAS = {}
for programa in json.loads(Path(__file__).with_name("catalogo.json").read_text(encoding="utf-8")):
    titulo = programa["title"]
    tipo, resto = titulo.split(" ", 1)
    if tipo != "Diplomado":
        continue
    nombre = resto.removeprefix("en ")
    area = programa["area"]
    seleccion, nombre, descripcion = SELECCION.get(
        programa["id"], ("", nombre[0].upper() + nombre[1:], "")
    )
    PROGRAMAS[programa["id"]] = {
        **programa, "nombre": nombre, "tipo": tipo, "horas": 160,
        "seleccion": seleccion, "descripcion": descripcion, "imagen": f"diplomado-{programa['id']}", "tono": TONOS[area],
    }

DESTACADOS = [PROGRAMAS[numero] for numero in SELECCION]
RESTO = [p for numero, p in PROGRAMAS.items() if numero not in SELECCION]
AREAS = sorted({p["area"] for p in PROGRAMAS.values()})
AREAS_PORTADA = list(dict.fromkeys(p["seleccion"] for p in DESTACADOS))
SLIDES = [(PROGRAMAS[numero], f"portada-{numero}") for numero in (1, 2, 15)]
