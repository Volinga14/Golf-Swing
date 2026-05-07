# Swing Lab PWA v0.3

PWA móvil tipo short para análisis simple de swing de golf.

## Mejoras de esta versión
- Vídeo fullscreen tipo Shorts.
- Flujo empieza directamente en **Fases**.
- Controlador de vídeo siempre visible dentro del dock: timeline, play/pause, velocidad y frame stepping.
- Modo de **dibujo simple** con líneas rectas.
- Deshacer línea a línea, ocultar/mostrar líneas y borrar todas.
- Generación de **capturas de fases** en la etapa de Análisis.
- Guardado local de sesión con:
  - vídeo,
  - fases marcadas,
  - líneas dibujadas,
  - capturas de cada fase.

## Uso
1. Subir o grabar un vídeo.
2. Marcar fases en la pestaña **Fases**.
3. Si quieres, dibujar líneas sobre el vídeo.
4. Ir a **Análisis** y pulsar **Generar**.
5. Guardar la sesión en local.
6. Recuperarla luego desde **Historial**.

## Notas
- Para instalarla como PWA real, usa HTTPS o localhost.
- Funciona sin backend.
- El número de frame se estima a 30 fps para simplificar esta versión.
