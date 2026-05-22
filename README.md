# Swing Lab PWA v0.9.8 Client Report & Training

Base estable heredada de v0.9.7 con mejoras incrementales:

- Reproductor visible protegido: el análisis automático usa vídeo oculto y no bloquea el player.
- Fases manuales protegidas: el motor no sobrescribe fases marcadas por el usuario.
- Refino temporal adicional: detección automática + patrón de swing para evitar fases absurdas.
- Pose Foundation más tolerante: más candidatos CDN, umbrales de landmarks menos estrictos y mensajes de fallback claros.
- Análisis cliente más limpio: resumen ejecutivo, scores, fases, prioridades, drills y QC.
- Informe descargable en HTML, imprimible/exportable a PDF desde el navegador.
- Exportación JSON para entrenamiento del motor: detección automática vs. fases finales corregidas.
- Historial guarda datos de entrenamiento junto con capturas y métricas.

## Recomendación de prueba

1. Subir vídeo.
2. Esperar a que aparezcan fases preliminares/detectadas.
3. Corregir manualmente Address, Top e Impact como mínimo.
4. Generar análisis.
5. Descargar informe y guardar sesión.
6. Exportar datos de entrenamiento si quieres alimentar el futuro motor.

## Notas

- Pose corporal requiere HTTPS/GitHub Pages y conexión inicial para cargar MediaPipe.
- Si Pose no está disponible, el motor cae a heurística temporal sin bloquear la app.
- Para móvil/PWA instalada, borrar caché o reinstalar tras cada versión.
