# Swing Lab PWA v0.9.5 Phase Auto-Detect Fix

Versión incremental sobre v0.9.4. Mantiene la UX de la línea v0.8.x/v0.9.x y corrige el flujo de fases al cargar vídeo.

## Cambios principales

- El vídeo se mantiene pausado y limpio al cargar.
- En cuanto el navegador conoce la duración del vídeo, se colocan fases preliminares para que siempre haya Address, Takeaway, Top, Impact y Finish seleccionados.
- La app sigue analizando en segundo plano y reemplaza esas fases por la detección automática cuando termina.
- Se refuerza el auto-start de detección con más eventos: metadata, durationchange, loadeddata, canplay y video frame callback cuando el navegador lo soporta.
- Se amplía el muestreo del motor inicial.
- Pose Foundation usa la ventana activa del motor temporal como zona candidata para evitar seleccionar movimientos previos, waggles o preparación del vídeo.
- Si Pose o el motor fallan, la app no se queda sin fases: mantiene un set ordenado y corregible.

## Nota técnica

MediaPipe se carga desde CDN; para usar pose corporal real se necesita conexión inicial y servir la app por HTTPS/GitHub Pages. Si falla, el motor vuelve al análisis heurístico, pero las fases preliminares siempre quedan disponibles.
