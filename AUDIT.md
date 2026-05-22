# Audit v0.9.8

## Problemas detectados en v0.9.7

- El reproductor ya era estable, pero el reconocimiento de fases seguía siendo débil.
- Pose podía no activarse y el análisis visible daba demasiada información técnica poco útil para cliente.
- No existía una salida tipo informe profesional ni un dataset claro para mejorar el motor.
- Existía un bug potencial en generación de capturas: referencia a `video` no definido al restaurar tiempo.

## Correcciones aplicadas

- `captureFrameAt()` usa vídeo oculto de análisis, no el reproductor visible.
- Corregida restauración de tiempo tras capturas: `refs.video` en lugar de variable inexistente.
- Añadido refino `refineDetectedPhaseTimes()` para mezclar detección con patrón temporal de swing cuando el resultado es incoherente.
- Guardado de `rawDetectedPhases` y `refinedDetectedPhases` en diagnostics.
- PoseEngine más tolerante: umbrales más bajos, menos frames mínimos, más candidatos CDN.
- Análisis visible orientado a cliente: resumen ejecutivo, dashboard, prioridades y ejercicios.
- Añadidos botones `Informe` y `Exportar datos entrenamiento`.
- Sesión guardada incluye `trainingRecord` y `reportSnapshot`.

## Validaciones realizadas

- `node --check` OK para:
  - app.js
  - engine/heuristic-engine.js
  - engine/pose-engine.js
  - engine/swing-engine.js
  - sw.js
- Estructura ZIP verificada.
- Manifest JSON parseado correctamente.

## Limitación conocida

No se ha podido ejecutar una prueba visual completa en navegador desde este entorno porque Chromium/Playwright bloquea navegación local por política de administración. La validación automática realizada es de sintaxis, estructura, referencias principales y empaquetado.
