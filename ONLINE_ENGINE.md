# Swing Lab PWA + GLAB Neural Backend

PWA móvil basada en los archivos originales de Swing Lab y conectada al backend neural GLAB.

## Uso

1. Arranca GLAB:

```powershell
cd "C:\Users\v.borges\OneDrive - SEA & PORTS\Documentos\GLAB\online-engine"
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

2. Para móvil/GitHub Pages, abre túnel:

```powershell
cloudflared tunnel --url http://localhost:8000
```

3. En la PWA pulsa **Motor** y pega solo la URL base:

```text
https://xxxxx.trycloudflare.com
```

No añadas `/api/health`.

## Endpoint usado

- `GET /api/health`
- `POST /api/analyze`

## Nota

El motor Python/modelos/vídeos no deben estar en este repo. Todo eso vive en GLAB.
