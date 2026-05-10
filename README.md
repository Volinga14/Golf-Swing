# Swing Lab PWA v0.7 Intelligent Flow

PWA móvil tipo short para análisis simple e inteligente de swing de golf.

## Novedades v0.7
- Detección automática inicial al importar vídeo mediante perfil local de movimiento.
- Autoavance inteligente de fases al marcar: avanza a la siguiente fase detectada o estimada.
- Análisis de tempo más profundo:
  - backswing,
  - downswing,
  - ratio de tempo,
  - intervalos entre fases,
  - frame estimado de impacto,
  - confianza aproximada de detección.
- Modo dibujo más limpio: al activar dibujo se ocultan fases y controles inferiores para dejar el vídeo libre.
- Capturas navegables: al tocar una captura se abre grande sustituyendo al vídeo y permite deslizar entre fases.
- Historial sin vídeo: las sesiones guardadas cargan directamente las capturas y permiten deslizar.
- Guardado ligero: capturas + fases + líneas + métricas, sin guardar el vídeo completo.

## Flujo recomendado
1. Importa o graba un vídeo.
2. La app detecta fases automáticamente.
3. Corrige manualmente si hace falta.
4. Pulsa Generar en Análisis.
5. Revisa capturas y métricas.
6. Guarda el análisis.

## Notas
- La detección automática es una heurística local, no un modelo IA pesado.
- El frame se estima a 30 fps para navegación práctica.
- Para instalar como PWA real usa HTTPS o localhost.


## v0.7
- Guías desactivadas por defecto al cargar vídeo.
- Dibujo disponible también al abrir sesiones del historial con solo capturas.
- Al tocar una captura en Análisis, la foto se muestra limpia a pantalla completa; toca de nuevo para recuperar controles.
- Dibujo mejorado: seleccionar y mover líneas existentes; mantener pulsado durante el trazado bloquea horizontal/vertical.
- Detección automática reforzada mediante perfil de movimiento suavizado, contraste, ventana de impacto y validaciones de tempo.
- Comentarios de análisis más accionables sobre tempo, intervalos, consistencia y revisión de fases.
