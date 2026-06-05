#!/usr/bin/env python3
"""
Consulta automática de cédulas de notificación - Poder Judicial Santa Fe
Usa Playwright: abre el navegador, llena el formulario, vos resolvés el
reCAPTCHA manualmente y el script hace el resto solo.
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

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

CONFIG = {
    "matricula":       os.environ.get("SISFE_MATRICULA", ""),
    "password":        os.environ.get("SISFE_PASSWORD", ""),
    "circunscripcion": os.environ.get("SISFE_CIRCUNSCRIPCION", "Santa Fe"),
    "colegio":         os.environ.get("SISFE_COLEGIO", "Contadores"),

    "email_destinatario": os.environ.get("EMAIL_DESTINATARIO", ""),
    "email_remitente":    os.environ.get("EMAIL_REMITENTE", ""),
    "email_password":     os.environ.get("EMAIL_PASSWORD", ""),
    "smtp_servidor":      os.environ.get("SMTP_SERVIDOR", "smtp.gmail.com"),
    "smtp_puerto":        int(os.environ.get("SMTP_PUERTO", "587")),

    "dias_busqueda":  int(os.environ.get("DIAS_BUSQUEDA", "1")),
    "archivo_estado": os.environ.get("ARCHIVO_ESTADO", "cedulas_vistas.json"),
}

BASE_URL   = "https://sisfe.justiciasantafe.gov.ar"
LOGIN_URL  = f"{BASE_URL}/login-matriculado"
BUSCAR_URL = f"{BASE_URL}/buscar-expediente"

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
# Estado persistente
# ---------------------------------------------------------------------------

def cargar_estado(ruta: str) -> set:
    p = Path(ruta)
    if not p.exists():
        return set()
    with p.open(encoding="utf-8") as f:
        return set(json.load(f).get("cedulas_vistas", []))


def guardar_estado(ruta: str, cedulas: set) -> None:
    with Path(ruta).open("w", encoding="utf-8") as f:
        json.dump(
            {"cedulas_vistas": sorted(cedulas), "actualizado": datetime.now().isoformat()},
            f, ensure_ascii=False, indent=2,
        )


# ---------------------------------------------------------------------------
# Login con Playwright
# ---------------------------------------------------------------------------

def hacer_login(page) -> bool:
    log.info("Abriendo página de login...")
    page.goto(LOGIN_URL, wait_until="networkidle")

    # Seleccionar Circunscripción
    try:
        page.locator("[formcontrolname='circunscripcion']").select_option(label=CONFIG["circunscripcion"])
        log.info(f"Circunscripción seleccionada: {CONFIG['circunscripcion']}")
    except Exception as e:
        log.warning(f"No se pudo seleccionar circunscripción automáticamente: {e}")

    # Seleccionar Colegio
    try:
        page.locator("[formcontrolname='colegio']").select_option(label=CONFIG["colegio"])
        log.info(f"Colegio seleccionado: {CONFIG['colegio']}")
    except Exception as e:
        log.warning(f"No se pudo seleccionar colegio automáticamente: {e}")

    # Completar matrícula
    page.locator("[formcontrolname='matricula']").fill(CONFIG["matricula"])
    log.info(f"Matrícula ingresada: {CONFIG['matricula']}")

    # Completar contraseña
    page.locator("[formcontrolname='password'], [formcontrolname='contrasena'], input[type='password']").first.fill(CONFIG["password"])
    log.info("Contraseña ingresada.")

    print("\n" + "="*60)
    print("ACCIÓN REQUERIDA: Resolvé el reCAPTCHA en el navegador")
    print("y luego hacé clic en 'Ingresar'.")
    print("Tenés 2 minutos.")
    print("="*60 + "\n")

    try:
        # Esperar hasta que la URL cambie a buscar-expediente
        page.wait_for_url(f"{BASE_URL}/buscar-expediente**", timeout=120_000)
        log.info("Login exitoso.")
        return True
    except PlaywrightTimeout:
        log.error("Tiempo de espera agotado. No se completó el login.")
        return False


# ---------------------------------------------------------------------------
# Búsqueda y extracción de cédulas
# ---------------------------------------------------------------------------

def buscar_cedulas(page) -> list[dict]:
    hoy   = date.today()
    desde = hoy - timedelta(days=CONFIG["dias_busqueda"])
    fmt   = "%d/%m/%Y"

    log.info(f"Buscando cédulas desde {desde.strftime(fmt)} hasta {hoy.strftime(fmt)}...")

    # Completar fechas del filtro de cédulas con firma digital
    try:
        campo_desde = page.locator("input[placeholder*='dd/mm'], input[type='date']").nth(0)
        campo_hasta = page.locator("input[placeholder*='dd/mm'], input[type='date']").nth(1)
        campo_desde.fill(desde.strftime(fmt))
        campo_hasta.fill(hoy.strftime(fmt))
    except Exception as e:
        log.warning(f"No se pudieron completar las fechas: {e}")

    # Hacer clic en "Efectuar la búsqueda"
    page.get_by_text("Efectuar la búsqueda").click()
    page.wait_for_load_state("networkidle")

    # Hacer clic en la pestaña "Ver cédulas de Notificación"
    try:
        page.get_by_text("Ver cédulas de Notificación").click()
        page.wait_for_load_state("networkidle")
        log.info("Pestaña 'Ver cédulas de Notificación' abierta.")
    except Exception as e:
        log.warning(f"No se encontró la pestaña de cédulas: {e}")

    return extraer_tabla(page)


def extraer_tabla(page) -> list[dict]:
    cedulas = []

    try:
        page.wait_for_selector("table", timeout=15_000)
    except PlaywrightTimeout:
        log.info("No se encontró tabla de resultados (sin cédulas en el período).")
        return cedulas

    filas = page.locator("table tbody tr").all()
    log.info(f"Filas encontradas: {len(filas)}")

    for fila in filas:
        celdas = fila.locator("td").all()
        if len(celdas) < 2:
            continue

        textos = [c.inner_text().strip() for c in celdas]

        # Intentar obtener link de cédula si existe
        link_el = fila.locator("a").first
        href = ""
        try:
            href_raw = link_el.get_attribute("href") or ""
            href = (BASE_URL + href_raw) if href_raw.startswith("/") else href_raw
        except Exception:
            pass

        cedula = {
            "expediente":        textos[0] if len(textos) > 0 else "",
            "caratula":          textos[1] if len(textos) > 1 else "",
            "fecha_inicio":      textos[2] if len(textos) > 2 else "",
            "ultima_novedad":    textos[3] if len(textos) > 3 else "",
            "radicacion_actual": textos[4] if len(textos) > 4 else "",
            "link_cedulas":      href,
        }
        cedulas.append(cedula)

    log.info(f"Cédulas extraídas: {len(cedulas)}")
    return cedulas


def filtrar_nuevas(cedulas: list[dict], vistas: set) -> list[dict]:
    return [c for c in cedulas if f"{c['expediente']}|{c['ultima_novedad']}" not in vistas]


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def enviar_email(cedulas: list[dict]) -> bool:
    cfg = CONFIG
    if not all([cfg["email_remitente"], cfg["email_password"], cfg["email_destinatario"]]):
        log.warning("Credenciales de email no configuradas.")
        return False

    asunto = f"[Poder Judicial SF] {len(cedulas)} cédula(s) nueva(s) - {date.today().strftime('%d/%m/%Y')}"

    filas_html = ""
    for c in cedulas:
        link = f'<a href="{c["link_cedulas"]}">Ver</a>' if c["link_cedulas"] else "-"
        filas_html += (
            f"<tr>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['expediente']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['caratula']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['ultima_novedad']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{c['radicacion_actual']}</td>"
            f"<td style='padding:6px;border:1px solid #ccc'>{link}</td>"
            f"</tr>"
        )

    cuerpo_html = f"""<html><body>
    <h2 style='color:#1a5c2a'>Poder Judicial - Provincia de Santa Fe</h2>
    <p>Se detectaron <strong>{len(cedulas)}</strong> cédula(s) de notificación nueva(s):</p>
    <table style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px'>
      <thead>
        <tr style='background:#1a5c2a;color:white'>
          <th style='padding:8px'>Expediente</th><th style='padding:8px'>Carátula</th>
          <th style='padding:8px'>Última novedad</th><th style='padding:8px'>Radicación</th>
          <th style='padding:8px'>Link</th>
        </tr>
      </thead>
      <tbody>{filas_html}</tbody>
    </table>
    <p style='color:#666;font-size:11px'>Consulta automática — {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
    </body></html>"""

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
    if not CONFIG["matricula"]:
        errores.append("SISFE_MATRICULA no configurada")
    if not CONFIG["password"]:
        errores.append("SISFE_PASSWORD no configurada")
    if not CONFIG["email_destinatario"]:
        errores.append("EMAIL_DESTINATARIO no configurado")
    for e in errores:
        log.error(e)
    return len(errores) == 0


def main() -> int:
    log.info("=" * 60)
    log.info("Inicio de consulta de cédulas de notificación")

    if not validar_config():
        return 1

    cedulas_vistas = cargar_estado(CONFIG["archivo_estado"])

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=300)
        context = browser.new_context(locale="es-AR")
        page    = context.new_page()

        try:
            if not hacer_login(page):
                return 1

            cedulas = buscar_cedulas(page)
        finally:
            browser.close()

    if not cedulas:
        log.info("No se encontraron cédulas en el período consultado.")
        return 0

    nuevas = filtrar_nuevas(cedulas, cedulas_vistas)
    if not nuevas:
        log.info("No hay cédulas nuevas.")
        return 0

    log.info(f"{len(nuevas)} cédula(s) nueva(s) encontrada(s).")

    if enviar_email(nuevas):
        for c in nuevas:
            cedulas_vistas.add(f"{c['expediente']}|{c['ultima_novedad']}")
        guardar_estado(CONFIG["archivo_estado"], cedulas_vistas)

    log.info("Consulta finalizada.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
