# Swing Lab PWA v0.9.3 Pose Initial

Versión incremental sobre v0.9.2.

## Cambios principales
- La detección inicial de fases se lanza cuando el vídeo ya tiene frames disponibles (`loadeddata/canplay`), no solo al leer metadatos.
- El motor usa Pose Foundation como fuente principal cuando MediaPipe está activo.
- El motor heurístico se mantiene como base/fallback, pero Top e Impact reciben más peso de landmarks corporales.
- Se amplía la ventana de muestreo de pose para vídeos largos o con preparación previa.
- Se aumentan las muestras de pose en la detección inicial.
- El mensaje de análisis indica si la pose se ha usado realmente para las fases.

## Notas
- Para que MediaPipe funcione, despliega la app en HTTPS, por ejemplo GitHub Pages.
- La primera carga de MediaPipe necesita conexión.
- Si venías de una versión instalada, reinstala la PWA o borra caché.
