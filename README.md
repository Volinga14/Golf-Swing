# Swing Lab PWA v0.5

PWA móvil tipo short para análisis visual simple de swing de golf.

## Mejoras v0.5
- Nuevo botón pequeño en la pantalla inicial para **cargar sesiones anteriores**.
- Botón de **Guardar análisis** más visible dentro de la pestaña Análisis.
- En la pestaña Análisis se ocultan los controles de reproducción, timeline y frame para dejar más espacio a resultados y capturas.
- Dibujo táctil mejorado en móvil:
  - se puede dibujar arrastrando,
  - o tocar un primer punto y luego un segundo punto para crear una línea recta.
- Indicador de modo dibujo con instrucciones rápidas.
- Se mantiene el guardado ligero: solo capturas, tiempos de fases, líneas y miniatura; no se guarda el vídeo completo.

## Uso
1. Subir o grabar vídeo.
2. Marcar fases. La app avanza automáticamente a la siguiente fase.
3. Opcional: activar dibujo y crear líneas sobre el vídeo.
4. Ir a Análisis y generar capturas.
5. Guardar análisis.
6. Recuperar capturas desde Historial o desde el botón de sesión anterior en la pantalla inicial.

## Nota
Para instalar como PWA real, usar HTTPS o localhost. El frame se estima a 30 fps en esta versión.
