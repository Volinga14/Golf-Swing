# Swing Lab PWA v0.9 Pose Foundation

Versión incremental sobre v0.8.5. Mantiene la UX tipo short y añade una arquitectura de motor más seria:

- `engine/heuristic-engine.js`: fallback local basado en movimiento, ventana activa y modelo temporal.
- `engine/pose-engine.js`: Pose Foundation opcional con MediaPipe Pose Landmarker si el navegador puede cargarlo.
- `engine/swing-engine.js`: orquestador. Intenta pose + heurística y, si falla, mantiene la app funcionando con fallback heurístico.

## Cambios principales

- Motor modular preparado para probar modelos sin romper la app.
- Primer uso de pose corporal si hay conexión y el navegador lo permite.
- Si MediaPipe no carga, la app sigue funcionando igual con el motor heurístico.
- Mejor análisis de resultados: estabilidad de cabeza, proxy de cadera, estabilidad de finish, altura de manos en Top y score pose.
- Panel de análisis más fácil de expandir con botón “Expandir” y handle más claro.
- Preparado para seguir hacia un modelo específico de swing.

## Nota técnica

Pose Foundation usa MediaPipe Tasks Vision desde CDN. La PWA funciona offline para la app base, pero la primera carga del modelo de pose requiere conexión. Esto evita meter archivos WASM/modelos pesados dentro del ZIP. El fallback heurístico se mantiene siempre disponible.
