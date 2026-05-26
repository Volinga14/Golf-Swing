# Swing Lab Hybrid v1.1.0 - Audit

## Objetivo

Conectar la PWA estática con el backend Python local y automatizar:

- análisis de vídeo en backend;
- devolución de fases a la app;
- corrección manual desde PWA;
- envío de correcciones al dataset de entrenamiento;
- mantenimiento de fallback local.

## Cambios principales

### PWA

- `engine/online-engine.js` actualizado a `OnlineEngineClient v1.1.0-local-pc-compatible`.
- `/api/analyze` usa ahora el campo `file`, compatible con backend FastAPI v0.1.1/v0.1.2.
- Se envían `view`, `club`, `user_id`, `save_video` y `metadata`.
- Se normalizan fases recibidas como `PhaseMark` del backend `{time, confidence, source}`.
- Se guarda `backendSessionId` dentro del training record.
- El botón **Enviar** manda JSON compatible con `TrainingCorrection`.

### Backend

- `api/main.py` actualizado a API v0.1.2.
- `/api/analyze` acepta `file` y también `video` por compatibilidad.
- `/api/analyze` acepta `metadata` JSON opcional.
- `/api/training/submit` acepta:
  - JSON `TrainingCorrection` directo;
  - JSON training record generado por la PWA;
  - multipart con campo `record`.
- CORS abierto para desarrollo local.

## Comprobaciones realizadas

- `app.js` validado con `node --check`.
- `engine/online-engine.js` validado con `node --check`.
- `sw.js` validado con `node --check`.
- Backend importado correctamente.
- `GET /api/health` probado con FastAPI TestClient.
- `POST /api/training/submit` probado con JSON.
- ZIP verificado.

## Limitaciones

- El motor de fases todavía necesita mejorar con más vídeos corregidos.
- Para móvil con GitHub Pages, se recomienda usar túnel HTTPS hacia el PC.
- El backend local debe estar encendido para análisis online.
