# Swing Lab PWA + GLAB Online Engine

Esta versión conecta la PWA original con el backend neural GLAB, manteniendo la misma experiencia móvil: botón **Motor**, carga/grabación de vídeo, detección automática, corrección manual, capturas, informe e historial.

## Endpoints GLAB usados

```text
GET  /api/health
POST /api/analyze
```

`engine/online-engine.js` adapta la respuesta de GLAB (`events_8`, `phases`, `window`, `meta`) al formato esperado por la PWA.

## Training

La PWA conserva el botón **Enviar**, pero si GLAB todavía no tiene `/api/training/submit`, usa **Exportar datos entrenamiento** por ahora.
