# Swing Lab AI MVP

## Estado actual

La app es una PWA local-first para revisar un vídeo de swing de golf.

Incluye:

- Subida local de vídeo con preparación previa: encuadre, guía y capture score antes de analizar.
- Detección de orientación vertical/horizontal.
- Cámara lenta y pantalla completa.
- Detección automática heurística de `address`, `top`, `impact` y `finish`, con apoyo de ejemplos locales corregidos.
- Corrección manual de fases y salto directo al frame.
- Guía ajustable de encuadre.
- Fases y grid ocultables.
- Capture score automático editable.
- Métricas automáticas revisables.
- Recomendaciones, métricas y explicación de resultados expandibles.
- Vista separada de bola con detección heurística, trayectoria animada y puntos editables.
- Layout móvil Android-friendly con banda de preparación compacta.
- Historial local con IndexedDB.
- Exportación JSON, CSV y PNG.

## Alcance honesto

La detección actual usa movimiento del vídeo y reglas heurísticas. No es todavía MediaPipe ni tracking biomecánico real.

El siguiente paso técnico es integrar MediaPipe Pose Landmarker Web para reemplazar las métricas heurísticas por landmarks reales.
