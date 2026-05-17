# Swing Lab PWA v0.8.5 Engine Refactor

Versión incremental sobre la línea v0.8.x, manteniendo el formato de app tipo short.

## Objetivo
Separar el motor de análisis de la interfaz para poder probar modelos nuevos sin romper la app.

## Cambios principales

- App mantiene la UX existente: vídeo limpio al cargar, fases al tocar, dibujo, capturas e historial.
- Nuevo directorio `engine/`.
- Nuevo motor separado `engine/heuristic-engine.js`.
- La app llama al motor mediante `window.SwingLabEngine.analyze()`.
- El motor devuelve una interfaz estable:
  - fases detectadas,
  - confianza por fase,
  - microfases,
  - métricas,
  - recomendaciones,
  - drills/ejercicios,
  - diagnóstico interno.
- Panel de análisis mejorado:
  - drag más suave,
  - se expande casi a pantalla completa,
  - permite leer resultados largos con más comodidad.
- Resultados ampliados:
  - score global,
  - fases,
  - tempo,
  - secuencia,
  - downswing,
  - finish,
  - findings técnicos,
  - tips,
  - ejercicios.

## Arquitectura

```text
app.js                    Interfaz, sesiones, vídeo, dibujo, capturas
engine/heuristic-engine.js Motor separado de análisis temporal del swing
styles.css                UX móvil, bottom sheet, shorts layout
sw.js                     Offline cache
```

## Siguiente paso previsto

v0.9 Pose Foundation:

- integrar pose corporal,
- extraer landmarks,
- usar cabeza/hombros/cadera/manos/pies para mejorar Top, Impact y Finish,
- guardar landmarks como dataset para un futuro modelo específico de golf.

## Limitación actual

El motor v0.8.5 sigue siendo heurístico. Es más modular y más fácil de mejorar, pero todavía no es detección de pose real ni modelo entrenado de swing.
