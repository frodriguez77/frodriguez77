#!/usr/bin/env python3
"""
Consulta automática de cédulas de notificación - Poder Judicial Santa Fe
Ejecutar diariamente con cron: 0 8 * * * /usr/bin/python3 /ruta/consulta_cedulas.py
"""

import os
import json
import smtplib
import logging
import sys
from datetime import datetime, date, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuración — completar antes de ejecutar
# ---------------------------------------------------------------------------

CONFIG = {
    # Credenciales de acceso como profesional matriculado
    "usuario": os.environ.get("SISFE_USUARIO", ""),
    "password": os.environ.get("SISFE_PASSWORD", ""),

    # Notificación por email
    "email_destinatario": os.environ.get("EMAIL_DESTINATARIO", ""),
    "email_remitente":    os.environ.get("EMAIL_REMITENTE", ""),
    "email_password":     os.environ.get("EMAIL_PASSWORD", ""),     # contraseña app Gmail
    "smtp_servidor":      os.environ.get("SMTP_SERVIDOR", "smtp.gmail.com"),
    "smtp_puerto":        int(os.environ.get("SMTP_PUERTO", "587")),

    # Cuántos días hacia atrás buscar cédulas (0 = solo hoy)
    "dias_busqueda": int(os.environ.get("DIAS_BUSQUEDA", "1")),

    # Archivo donde se guardan las cédulas ya vistas para no renotificar
    "archivo_estado": os.environ.get("ARCHIVO_ESTADO", "cedulas_vistas.json"),
}

BASE_URL   = "https://sisfe.justiciasantafe.gov.ar"
LOGIN_URL  = f"{BASE_URL}/login-matriculado"
BUSCAR_URL = f"{BASE_URL}/buscar-expediente"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-AR,es;q=0.9",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("consulta_cedulas.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Persistencia del estado (cédulas ya vistas)
# ---------------------------------------------------------------------------

def cargar_estado(ruta: str) -> set:
    p = Path(ruta)
    if not p.exists():
        return set()
    with p.open(encoding="utf-8") as f:
        data = json.load(f)
    return set(data.get("cedulas_vistas", []))


def guardar_estado(ruta: str, cedulas: set) -> None:
    with Path(ruta).open("w", encoding="utf-8") as f:
        json.dump({"cedulas_vistas": sorted(cedulas), "actualizado": datetime.now().isoformat()}, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Sesión HTTP y login
# ---------------------------------------------------------------------------

def crear_sesion() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def obtener_token_csrf(session: requests.Session, url: str) -> str:
    """Extrae el token CSRF/hidden field del formulario de login si existe."""
    r = session.get(url, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    token_input = soup.find("input", {"name": "_token"}) or soup.find("input", {"name": "csrf_token"})
    return token_input["value"] if token_input else ""


def login(session: requests.Session) -> bool:
    log.info("Iniciando sesión como profesional matriculado...")
    try:
        token = obtener_token_csrf(session, LOGIN_URL)
        payload = {
            "usuario":  CONFIG["usuario"],
            "password": CONFIG["password"],
        }
        if token:
            payload["_token"] = token

        r = session.post(LOGIN_URL, data=payload, timeout=30, allow_redirects=True)
        r.raise_for_status()

        # Verificar que el login fue exitoso buscando texto de bienvenida o ausencia de form de login
        if "login" in r.url.lower() and "bienvenido" not in r.text.lower():
            log.error("Login fallido: posiblemente credenciales incorrectas o cambió la estructura del sitio.")
            return False

        log.info("Sesión iniciada correctamente.")
        return True

    except requests.RequestException as e:
        log.error(f"Error de red al hacer login: {e}")
        return False


# ---------------------------------------------------------------------------
# Consulta de cédulas de notificación
# ---------------------------------------------------------------------------

def consultar_cedulas(session: requests.Session) -> list[dict]:
    """
    Realiza la búsqueda de cédulas de notificación del profesional.
    Filtra por el rango de fechas configurado.
    """
    hoy      = date.today()
    desde    = hoy - timedelta(days=CONFIG["dias_busqueda"])
    fmt      = "%d/%m/%Y"

    params = {
        "cedulas_desde": desde.strftime(fmt),
        "cedulas_hasta": hoy.strftime(fmt),
    }

    log.info(f"Consultando cédulas desde {desde.strftime(fmt)} hasta {hoy.strftime(fmt)}...")

    try:
        r = session.get(BUSCAR_URL, params=params, timeout=30)
        r.raise_for_status()
    except requests.RequestException as e:
        log.error(f"Error al consultar expedientes: {e}")
        return []

    return parsear_cedulas(r.text)


def parsear_cedulas(html: str) -> list[dict]:
    """
    Extrae las cédulas de notificación de la tabla de resultados.
    Ajustar los selectores CSS si el sitio cambia su estructura.
    """
    soup     = BeautifulSoup(html, "html.parser")
    cedulas  = []

    # Buscar la tabla de resultados (ajustar selector si es necesario)
    tabla = soup.find("table") or soup.find("div", class_=lambda c: c and "result" in c.lower())
    if not tabla:
        log.warning("No se encontró tabla de resultados en la respuesta.")
        return cedulas

    filas = tabla.find_all("tr")[1:]  # saltar encabezado
    for fila in filas:
        celdas = fila.find_all("td")
        if len(celdas) < 3:
            continue

        # Buscar el link a cédulas de notificación dentro de la fila
        link_cedula = fila.find("a", string=lambda t: t and "cédula" in t.lower())
        href = (BASE_URL + link_cedula["href"]) if link_cedula and link_cedula.get("href") else ""

        cedula = {
            "expediente":         celdas[0].get_text(strip=True),
            "caratula":           celdas[1].get_text(strip=True) if len(celdas) > 1 else "",
            "fecha_inicio":       celdas[2].get_text(strip=True) if len(celdas) > 2 else "",
            "ultima_novedad":     celdas[3].get_text(strip=True) if len(celdas) > 3 else "",
            "radicacion_actual":  celdas[4].get_text(strip=True) if len(celdas) > 4 else "",
            "link_cedulas":       href,
        }
        cedulas.append(cedula)

    log.info(f"Se encontraron {len(cedulas)} expediente(s) con cédulas.")
    return cedulas


def filtrar_nuevas(cedulas: list[dict], vistas: set) -> list[dict]:
    """Devuelve sólo las cédulas que no fueron notificadas antes."""
    nuevas = []
    for c in cedulas:
        clave = f"{c['expediente']}|{c['ultima_novedad']}"
        if clave not in vistas:
            nuevas.append(c)
    return nuevas


# ---------------------------------------------------------------------------
# Notificación por email
# ---------------------------------------------------------------------------

def enviar_email(cedulas: list[dict]) -> bool:
    if not cedulas:
        return True

    cfg = CONFIG
    if not all([cfg["email_remitente"], cfg["email_password"], cfg["email_destinatario"]]):
        log.warning("Credenciales de email no configuradas. Saltando envío.")
        return False

    asunto = f"[Poder Judicial SF] {len(cedulas)} cédula(s) nueva(s) - {date.today().strftime('%d/%m/%Y')}"

    # Construir cuerpo HTML
    filas_html = ""
    for c in cedulas:
        link = f'<a href="{c["link_cedulas"]}">Ver cédulas</a>' if c["link_cedulas"] else "-"
        filas_html += (
            f"<tr>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['expediente']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['caratula']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['ultima_novedad']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['radicacion_actual']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{link}</td>"
            f"</tr>"
        )

    cuerpo_html = f"""
    <html><body>
    <h2 style='color:#1a5c2a'>Poder Judicial - Provincia de Santa Fe</h2>
    <p>Se detectaron <strong>{len(cedulas)}</strong> cédula(s) de notificación nueva(s):</p>
    <table style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px'>
      <thead>
        <tr style='background:#1a5c2a;color:white'>
          <th style='padding:8px'>Expediente</th>
          <th style='padding:8px'>Carátula</th>
          <th style='padding:8px'>Última novedad</th>
          <th style='padding:8px'>Radicación actual</th>
          <th style='padding:8px'>Acción</th>
        </tr>
      </thead>
      <tbody>{filas_html}</tbody>
    </table>
    <p style='color:#666;font-size:11px'>Consulta automática ejecutada el {datetime.now().strftime('%d/%m/%Y a las %H:%M')}.<br>
    Fuente: <a href="{BUSCAR_URL}">{BUSCAR_URL}</a></p>
    </body></html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = asunto
    msg["From"]    = cfg["email_remitente"]
    msg["To"]      = cfg["email_destinatario"]
    msg.attach(MIMEText(cuerpo_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(cfg["smtp_servidor"], cfg["smtp_puerto"]) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(cfg["email_remitente"], cfg["email_password"])
            smtp.sendmail(cfg["email_remitente"], cfg["email_destinatario"], msg.as_string())
        log.info(f"Email enviado a {cfg['email_destinatario']}.")
        return True
    except smtplib.SMTPException as e:
        log.error(f"Error al enviar email: {e}")
        return False


# ---------------------------------------------------------------------------
# Flujo principal
# ---------------------------------------------------------------------------

def validar_config() -> bool:
    errores = []
    if not CONFIG["usuario"]:
        errores.append("SISFE_USUARIO no configurado")
    if not CONFIG["password"]:
        errores.append("SISFE_PASSWORD no configurado")
    if not CONFIG["email_destinatario"]:
        errores.append("EMAIL_DESTINATARIO no configurado")
    if errores:
        for e in errores:
            log.error(e)
        return False
    return True


def main() -> int:
    log.info("=" * 60)
    log.info("Inicio de consulta de cédulas de notificación")

    if not validar_config():
        log.error("Configuración incompleta. Ver README.md para instrucciones.")
        return 1

    cedulas_vistas = cargar_estado(CONFIG["archivo_estado"])
    session        = crear_sesion()

    if not login(session):
        return 1

    cedulas = consultar_cedulas(session)
    if not cedulas:
        log.info("No se encontraron cédulas en el período consultado.")
        return 0

    nuevas = filtrar_nuevas(cedulas, cedulas_vistas)
    if not nuevas:
        log.info("No hay cédulas nuevas (todas ya fueron notificadas).")
        return 0

    log.info(f"{len(nuevas)} cédula(s) nueva(s) encontrada(s).")

    if enviar_email(nuevas):
        # Actualizar estado sólo si el email se envió correctamente
        for c in nuevas:
            cedulas_vistas.add(f"{c['expediente']}|{c['ultima_novedad']}")
        guardar_estado(CONFIG["archivo_estado"], cedulas_vistas)

    log.info("Consulta finalizada.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
