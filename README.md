# Swing Lab AI MVP

MVP local-first para revisar un vídeo de swing de golf desde el navegador.

## Qué incluye

- Subida de vídeo local.
- Detección de orientación vertical/horizontal y ajuste del visor.
- Selección de vista DTL / FO, palo y resultado de bola.
- Reproductor frame-by-frame con teclado, pantalla completa y cámara lenta.
- Detección automática heurística de address, top, impact y finish, con corrección manual.
- Botones de fase para saltar directamente al frame detectado.
- Canvas con guía ajustable, fases ocultables, grid, líneas y ángulos manuales.
- Capture score automático y editable.
- Métricas automáticas revisables con botones para comprobar los frames relevantes.
- Recomendación principal, recomendaciones secundarias y explicación de resultados.
- Vista separada de bola/golpe para marcar o sugerir la trayectoria visual del golpe.
- Historial local con IndexedDB.
- Exportación JSON, CSV y PNG del frame actual.
- Guardrails de confianza: sin vídeo no hay score, y las fases deben estar en orden cronológico.
- Pruebas automatizadas de lógica, assets, servidor temporal y captura headless.

## Cómo abrirlo

Sirve la carpeta `app` con un servidor estático y abre `index.html`. También puede abrirse directamente como archivo local, aunque la instalación PWA y el service worker solo funcionan con `http://localhost`.

```powershell
cd golf-swing-ai
python -m http.server 5174 --bind 127.0.0.1 --directory ./app
```

Luego abre `http://127.0.0.1:5174/`.

## Pruebas

```powershell
cd golf-swing-ai
node ./tests/smoke-test.mjs
node ./tests/browser-headless-test.mjs
```

La prueba headless usa Microsoft Edge si está instalado y genera `test-artifacts/swing-lab-home.png`.

## Alcance honesto del MVP

Esta versión no ejecuta todavía MediaPipe ni detecta landmarks reales. Es la base usable del Sprint 1: visor, eventos, overlays, datos, reporte y exportaciones. El siguiente paso natural es integrar MediaPipe Pose Landmarker Web sobre esta misma estructura.
