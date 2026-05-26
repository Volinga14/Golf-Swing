# Conectar la PWA de GitHub con el backend local

Esta versión mantiene la PWA estática en GitHub Pages y usa el backend Python en tu ordenador.

## 1. Arrancar el backend en el PC

Desde `online-engine/`:

```powershell
.venv\Scripts\activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Comprueba:

```text
http://localhost:8000/api/health
```

## 2. Probar desde el mismo PC

En la PWA, botón **Motor**:

```text
http://localhost:8000
```

Esto solo sirve en el mismo ordenador.

## 3. Probar desde móvil

Si la PWA está en GitHub Pages, normalmente será HTTPS. Un navegador móvil puede bloquear llamadas desde una web HTTPS a un backend HTTP local por mixed content / private network access.

La forma más fiable es usar un túnel HTTPS:

### Opción Cloudflare Tunnel

Instala `cloudflared` y ejecuta:

```powershell
cloudflared tunnel --url http://localhost:8000
```

Te dará una URL tipo:

```text
https://xxxxx.trycloudflare.com
```

En la PWA, botón **Motor**, pega esa URL.

### Opción ngrok

```powershell
ngrok http 8000
```

Usa la URL `https://...ngrok-free.app` en el botón **Motor**.

## 4. Flujo de uso

1. Backend corriendo en PC.
2. Túnel HTTPS activo si usas móvil.
3. PWA abierta desde GitHub Pages.
4. Botón **Motor** → pegar URL del backend/túnel.
5. Subir vídeo.
6. La PWA llama a `/api/analyze`.
7. El backend guarda sesión, vídeo, capturas e informe.
8. Corriges fases en la PWA.
9. En Análisis → botón **Enviar**.
10. La corrección se guarda como dato de entrenamiento.

## 5. Qué se guarda

En `online-engine/data/`:

- `videos/`: vídeos analizados.
- `captures/`: capturas por fase.
- `reports/`: informes HTML.
- `features/`: features/pose/métricas.
- `training/`: detección automática vs corrección final.
- `db/`: base SQLite local.

## 6. Problemas típicos

### La app dice que el motor no está disponible

Comprueba:

- Backend encendido.
- URL correcta, sin barra final.
- Si estás en móvil/GitHub Pages, usa HTTPS con túnel.
- Firewall de Windows permite Python en red privada.

### El análisis funciona pero Enviar falla

La sesión debe haber sido analizada primero con el backend online. Si se analizó solo en local/fallback, no hay `session_id` del backend para guardar corrección.

### GitHub Pages + http://192.168.x.x:8000 no conecta

Usa Cloudflare Tunnel/ngrok. Es lo más limpio para móvil.

## v1.1.1 connection fix

The Motor button is now visible on the start screen before uploading a video.

When using a Cloudflare quick tunnel, paste only the base URL in the app, for example:

```text
https://xxxx.trycloudflare.com
```

Do not include `/api/health`. If you paste it by mistake, the app will now sanitize it automatically.
