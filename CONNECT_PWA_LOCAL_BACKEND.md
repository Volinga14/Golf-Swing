# Conectar la PWA con GLAB

## Backend en PC

```powershell
cd "C:\Users\v.borges\OneDrive - SEA & PORTS\Documentos\GLAB\online-engine"
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Mismo PC

Botón **Motor**:

```text
http://localhost:8000
```

## Móvil / GitHub Pages

```powershell
cloudflared tunnel --url http://localhost:8000
```

Botón **Motor**:

```text
https://xxxxx.trycloudflare.com
```

Usa solo la URL base. No añadas `/api/health` ni `/api/analyze`.
