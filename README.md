# Swing Lab PWA v0.9.1 Pose Active

Versión incremental sobre v0.9 Pose Foundation.

## Cambios principales
- Se mantiene la base visual y de uso de v0.8.x/v0.9.
- MediaPipe Pose se carga de forma más robusta desde CDN con varios candidatos.
- Se prueba primero GPU y, si falla en móvil, pasa automáticamente a CPU.
- El modelo de pose usa URLs exactas y alternativas para evitar fallback innecesario.
- El service worker ya no cachea assets externos de MediaPipe para evitar respuestas obsoletas.
- En Análisis se elimina el botón Expandir: el panel se maneja con el gesto de deslizar.
- En Análisis, al tocar el vídeo para modo limpio, se mantienen los controles compactos de play/timeline/frame como en Fases.

## Notas
- Para que Pose funcione debe estar desplegada en HTTPS, por ejemplo GitHub Pages.
- La primera carga de MediaPipe necesita conexión.
- Si MediaPipe no puede activarse, la app sigue funcionando con el motor heurístico.
- Si venías de una versión anterior instalada, reinstala la PWA o borra caché.
