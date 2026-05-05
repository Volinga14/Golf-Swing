# Swing Lab AI v0.5.5

PWA local-first para revisar vídeos de swing de golf desde el navegador. Esta versión se centra en limpieza, estabilidad y UX base: la app deja más claro qué puede analizar, qué es editable y qué parte es una estimación heurística.

## Qué incluye v0.5.5

- Flujo guiado de 7 pasos: subir vídeo, ajustar encuadre, revisar calidad, analizar, corregir fases, revisar métricas y guardar/exportar.
- Estados visibles de app: sin vídeo, vídeo cargado, analizando, análisis completado, sesión guardada, error y sesión histórica sin vídeo.
- Historial local corregido: la app no finge que el vídeo sigue disponible cuando solo se han guardado datos.
- Guardado de miniatura y hasta 4 frames principales: address, top, impact y finish.
- Aviso claro al cargar una sesión histórica sin vídeo original.
- Desactivación de acciones que dependen del vídeo cuando solo hay una sesión histórica: reproducir, analizar, marcar fases, pantalla completa y PNG.
- Aprendizaje local limpiado: sin ejemplo hardcodeado de producción. Las correcciones reales quedan separadas del modo demo.
- Recomendaciones con lenguaje menos concluyente: “posible”, “revisar visualmente” y etiquetas de confianza/fuente.
- Mejoras visuales rápidas: jerarquía de acciones, cards de recomendaciones priorizadas, badges, mobile-first y botones claros de nuevo/guardar.
- PWA/cache mejorado: versión visible, cache v0.5.5, `skipWaiting`, `clients.claim`, estrategia network-first para HTML/JS/CSS y botón de actualización cuando haya nueva versión.
- Tests ampliados: smoke, regresión de flujo y browser headless con Chromium/Chrome/Edge cuando está disponible y responde correctamente.

## Alcance honesto

Esta versión todavía no usa MediaPipe ni landmarks reales. El análisis automático sigue siendo heurístico y revisable. El objetivo de v0.5.5 es que la app sea usable, estable y honesta antes de integrar IA visual real en v0.6.

## Cómo abrirlo

Sirve la carpeta `app` con un servidor estático y abre `index.html`.

```powershell
python -m http.server 5174 --bind 127.0.0.1 --directory ./app
```

Luego abre `http://127.0.0.1:5174/`.

## Pruebas

```powershell
npm test
```

También se pueden ejecutar por separado:

```powershell
npm run test:smoke
npm run test:workflow
npm run test:browser
```

La prueba browser busca Chromium, Chrome o Edge. Si el navegador headless está instalado pero no responde a tiempo en el entorno local/CI, el test se salta de forma controlada para no bloquear el pipeline.

## Siguiente paso natural

v0.6 debería integrar detección corporal real con landmarks, mejorar la detección de fases y convertir las métricas actuales en mediciones visuales verificables.


## v0.5.5 Flow redesign

This build introduces a mobile-first, video-first guided UX: home screen, automatic initial framing, phase-by-phase confirmation, sticky next-step card, and a secondary metrics/report drawer.

## v0.5.5 Phase & guide polish

This iteration refines the redesigned flow for real mobile use:

- Direct phase navigation: tap Address, Top, Impact or Finish to jump to that phase.
- Contextual phase controls: only the active phase shows its controls.
- One-tap phase confirmation: “Confirmar frame actual” marks and confirms the selected frame at the same time.
- In-video drawing controls: select, line, angle, clear, guide, phases and grid controls are now inside the video area so they remain usable in fullscreen.
- Improved framing guide: body box now represents head-to-hips/seat, with separate feet-direction and club-angle guides.
- Updated guide example SVG to explain the new alignment logic.
