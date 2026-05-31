# Swing Lab PWA + GLAB Neural Backend

PWA móvil para analizar swings con el backend neural GLAB.

Esta carpeta está pensada para GitHub Pages y debe contener solo el frontend/PWA. El motor pesado, modelos, vídeos y datos viven fuera del repo, en `GLAB/online-engine`.

## Uso rápido

### 1. Arrancar GLAB

```powershell
cd "C:\Users\v.borges\OneDrive - SEA & PORTS\Documentos\GLAB\online-engine"
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Conectar la app

En la PWA, pulsa **Motor**.

Mismo PC:

```text
http://localhost:8000
```

Móvil/GitHub Pages con Cloudflare:

```powershell
cloudflared tunnel --url http://localhost:8000
```

Pega solo la URL base:

```text
https://xxxxx.trycloudflare.com
```

No pegues `/api/health`.

## Archivos incluidos

```text
index.html
app.js
config.js
styles.css
sw.js
manifest.webmanifest
engine/online-engine.js
icons/icon-192.png
icons/icon-512.png
README.md
ONLINE_ENGINE.md
CONNECT_PWA_LOCAL_BACKEND.md
AUDIT.md
```
