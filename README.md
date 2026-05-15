# Swing Lab Smart v0.9

Nueva app PWA para análisis inteligente 2D de swing de golf.

## Qué hace

- Carga o graba un vídeo de swing.
- Lee el vídeo completo sin reproducirlo entero al usuario.
- Genera un perfil de movimiento por muestreo de frames.
- Detecta ventana activa del swing y selecciona 8 fases: Address, Takeaway, Mid-backswing, Top, Transition, Pre-impact, Impact y Finish.
- Captura frames clave y permite revisar/corregir tiempos.
- Estima métricas visuales 2D: tempo, ventana activa, impacto, estabilidad del finish, drift visual y release/rotación.
- Genera informe técnico imprimible con 6 páginas: resumen ejecutivo, secuencia, setup/backswing, impacto/finish, dashboard numérico y plan de mejora.
- Exporta datos del análisis en JSON.

## Limitaciones actuales

- El análisis es 2D y sin calibración real de cámara.
- No usa todavía un modelo de pose humana completo ni launch monitor.
- Las métricas son estimadas y deben auditarse con revisión de frames.

## Siguiente paso recomendado

Integrar un módulo de pose estimation en navegador o backend para calcular articulaciones, ángulos y desplazamientos corporales con mayor precisión.
