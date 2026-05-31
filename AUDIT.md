# Swing Lab PWA v1.2.0 GLAB Audit

## Cambios realizados

- Conservada la estructura móvil original de la PWA.
- `config.js` actualizado a `v1.2.0-glab-neural`.
- Añadido `engine/online-engine.js` compatible con GLAB.
- Eliminadas referencias a engines locales no incluidos:
  - `engine/heuristic-engine.js`
  - `engine/pose-engine.js`
  - `engine/swing-engine.js`
- `sw.js` actualizado para cachear solo archivos presentes.
- La URL del botón **Motor** se sanea automáticamente si se pega `/api/health` o `/api/analyze`.

## Backend esperado

```text
GET  /api/health
POST /api/analyze
```

## Pendiente

- Añadir `/api/training/submit` en GLAB para que el botón **Enviar** guarde correcciones directamente.
