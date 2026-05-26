# Swing Lab Hybrid v1.1.0

PWA móvil + backend Python local para análisis de swing.

## Qué incluye

- PWA estática lista para GitHub Pages.
- Backend FastAPI/Python en `online-engine/`.
- Motor backend con OpenCV + MediaPipe.
- Guardado local de vídeos, capturas, informes, features y correcciones.
- Botón **Motor** en la app para configurar la URL del backend.
- Botón **Enviar** en análisis para guardar correcciones como dataset de entrenamiento.

## Uso rápido backend local

```powershell
cd online-engine
.venv\Scripts\activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Comprueba:

```text
http://localhost:8000/api/health
```

## Conectar la app

En la PWA, botón **Motor**:

- mismo PC: `http://localhost:8000`
- móvil/GitHub Pages: usa Cloudflare Tunnel/ngrok y pega la URL HTTPS.

Ver `CONNECT_PWA_LOCAL_BACKEND.md`.

## Flujo de entrenamiento

1. Subes vídeo en la PWA.
2. La PWA manda vídeo al backend.
3. Backend detecta fases y genera capturas/informe.
4. Corriges fases en la PWA.
5. Botón **Enviar**.
6. Backend guarda detección automática vs corrección manual en `online-engine/data/training/`.

## Carpetas importantes

```text
online-engine/data/videos      vídeos analizados
online-engine/data/captures    capturas por fase
online-engine/data/reports     informes HTML
online-engine/data/features    features y pose samples
online-engine/data/training    dataset de correcciones
online-engine/data/db          SQLite local
```

## Notas

- Mantener Python 3.12 para máxima compatibilidad con OpenCV/MediaPipe.
- El backend debe estar encendido para usar motor online.
- Si no hay backend, la app mantiene fallback local.
