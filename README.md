# GLAB Swing PWA

Frontend ligero para enviar vídeos DTL al backend GLAB.

## Arquitectura

- Este repo contiene solo la PWA.
- El backend neural vive fuera del repo, en `GLAB/online-engine`.
- La PWA llama a:
  - `GET /api/health`
  - `POST /api/analyze`

## Uso local

1. Arranca GLAB:

```powershell
cd "C:\Users\v.borges\OneDrive - SEA & PORTS\Documentos\GLAB\online-engine"
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

2. Abre la PWA.

3. Configura API base:
   - PC: `http://localhost:8000`
   - móvil en WiFi: `http://IP_DEL_PC:8000`
   - GitHub Pages/móvil: usar URL HTTPS de Cloudflare Tunnel.

## No subir a este repo

- modelos `.pt`, `.pth`, `.onnx`
- vídeos
- datasets
- `.venv`
- carpetas de backend/training
