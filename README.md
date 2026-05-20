# Swing Lab PWA v0.9.4 Pose Auto-Start

Versión incremental sobre v0.9.3. Mantiene la UX de la línea v0.8.x/v0.9.x y mejora el análisis inicial.

## Cambios principales

- El vídeo se mantiene pausado y limpio al cargar.
- La app empieza a preparar MediaPipe Pose inmediatamente tras seleccionar el vídeo.
- La detección inicial se lanza en cuanto el navegador tiene frames disponibles, sin esperar a reproducir ni entrar en Análisis.
- Pose Foundation hace un escaneo amplio del vídeo y después una segunda pasada más densa alrededor de la ventana activa del swing.
- Top e Impact reciben más peso desde landmarks corporales; el motor heurístico queda como estabilizador/fallback.
- Mensajes de estado visibles mientras analiza: preparando pose, analizando fases y fases listas.
- Service worker actualizado para evitar caché de motores anteriores.

## Nota técnica

MediaPipe se carga desde CDN; para usar pose corporal real se necesita conexión inicial y servir la app por HTTPS/GitHub Pages. Si falla, el motor vuelve al análisis heurístico.
