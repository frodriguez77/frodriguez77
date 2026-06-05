# Consulta automática de cédulas de notificación
**Poder Judicial - Provincia de Santa Fe**

Monitorea diariamente las cédulas de notificación del sistema SISFE y envía un email cuando aparecen novedades nuevas.

---

## Requisitos

- Python 3.10 o superior
- Cuenta de profesional matriculado en SISFE
- Cuenta Gmail con [contraseña de aplicación](https://myaccount.google.com/apppasswords) activada

---

## Instalación (una sola vez)

```bash
# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Configurar credenciales
cp .env.example .env
nano .env          # completar con tus datos reales
```

---

## Ejecución manual

```bash
# Cargar variables de entorno y ejecutar
export $(cat .env | xargs) && python3 consulta_cedulas.py
```

---

## Programar ejecución diaria con cron (Linux/Mac)

```bash
# Abrir el editor de cron
crontab -e

# Agregar esta línea para ejecutar todos los días a las 8:00 AM
0 8 * * * cd /ruta/completa/a/este/directorio && export $(cat .env | xargs) && /usr/bin/python3 consulta_cedulas.py >> consulta_cedulas.log 2>&1
```

> Reemplazar `/ruta/completa/a/este/directorio` con la ruta real donde está el proyecto.

---

## Programar en Windows (Task Scheduler)

1. Abrir **Programador de tareas** → Crear tarea básica
2. Disparador: Diariamente a las 08:00
3. Acción: Iniciar un programa
   - Programa: `python`
   - Argumentos: `consulta_cedulas.py`
   - Iniciar en: `C:\ruta\al\proyecto`
4. Configurar las variables de entorno en el archivo `.env`

---

## Archivos generados

| Archivo | Descripción |
|---|---|
| `cedulas_vistas.json` | Historial de cédulas ya notificadas (evita duplicados) |
| `consulta_cedulas.log` | Log de cada ejecución |

---

## Nota importante

El sitio SISFE bloquea accesos desde IPs externas a la red argentina.
El script **debe ejecutarse desde tu computadora local** o desde un servidor dentro de Argentina.
No funciona desde GitHub Actions u otros servicios en la nube internacionales.

---

## Solución de problemas

**"Login fallido"** → Verificar usuario/contraseña en `.env`

**"No se encontró tabla de resultados"** → El sitio puede haber cambiado su estructura HTML. Abrir una consulta en el navegador, inspeccionar el elemento y ajustar el selector en la función `parsear_cedulas()` del script.

**Error de email** → Asegurarse de usar una [contraseña de aplicación](https://myaccount.google.com/apppasswords) de Gmail, no la contraseña normal de la cuenta.
