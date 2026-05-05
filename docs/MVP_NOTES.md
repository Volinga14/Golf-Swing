# MVP notes — v0.5.5

## Objetivo

Convertir el MVP previo en una PWA más usable y honesta: menos sensación de prototipo, estados claros, historial robusto y recomendaciones revisables.

## Cambios principales

1. Flujo principal guiado con 7 pasos visibles.
2. Estados de app visibles en la cabecera.
3. Historial local sin vídeo corregido con aviso y snapshots.
4. Guardado de miniatura y frames address/top/impact/finish.
5. Acciones dependientes de vídeo deshabilitadas cuando se carga una sesión histórica.
6. Aprendizaje local sin ejemplo hardcodeado; modo demo separado.
7. Recomendaciones menos diagnósticas y con etiquetas de confianza/fuente.
8. Service worker versionado y actualización más fiable.
9. Tests smoke + workflow + browser headless con Chromium/Chrome/Edge.

## Pendiente para v0.6

- Integrar landmarks corporales.
- Separar métricas por vista DTL/FO.
- Mejorar detección real de fases.
- Añadir evidencia visual por recomendación.

## v0.5.5 Flow redesign

Large UX redesign focused on mobile-first, video-first usage:

- New home screen with three primary options: upload swing video, load previous analysis, or prepare comparison.
- Guided flow reorganized around: upload, fit/crop guide, quality review, analyze, phase confirmation, report, save/export.
- Video is now the center of the interface, with YouTube/Instagram-style playback controls and a sticky next-step card.
- Automatic guide fitting is attempted when video metadata is loaded; manual guide sliders remain available.
- Phase review now works as a sequence: the app jumps to each proposed phase and the user confirms or replaces it with the current frame.
- Report and metrics are moved into a secondary analysis drawer so the user can stay in the video or leave the video to inspect metrics.
- Previous technical panels are still available, but act as assistive drawers rather than the main experience.
- Service worker cache key changed to force mobile refresh for the redesign.
