# Swing Lab PWA v0.8.3 Smart Phases

Base: v0.8.2 Clean Load.

Esta versión mantiene la UX simple tipo short y añade una capa más inteligente de análisis local:

- Carga limpia: el vídeo queda pausado y sin paneles hasta tocar la pantalla.
- Guías OFF por defecto.
- Dibujo móvil corregido con dos toques, arrastre, selección y movimiento de líneas.
- SwingEngine v2.2 para detección automática de fases:
  - segmentación de ventana activa del swing,
  - perfil de movimiento por frames muestreados,
  - detección de Address, Takeaway, Top, Impact y Finish,
  - confianza por fase,
  - microfases internas: mid-backswing, transition y pre-impact.
- Métricas inteligentes:
  - backswing,
  - downswing,
  - follow-through,
  - tempo,
  - ventana activa,
  - score global,
  - calidad de fases,
  - warnings de consistencia.
- Guardado ligero: capturas, fases, métricas y líneas. No guarda el vídeo completo.

## Limitaciones

Sigue siendo análisis 2D local basado en vídeo y movimiento. No usa todavía pose real, detección robusta de palo ni calibración métrica. La detección automática debe usarse como pre-marcado y revisar manualmente Top e Impact antes de guardar.
