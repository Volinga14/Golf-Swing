# Swing Lab PWA v0.2 - Fullscreen Shorts Workflow

https://volinga14.github.io/Golf-Swing/
Esta versión corrige la usabilidad móvil de la v0.1. El objetivo es que la app se use como un Short de YouTube: vídeo a pantalla completa, controles mínimos y marcado claro de fases.

## Cambios principales v0.2

- Vídeo realmente fullscreen usando `100vw` y `100dvh`.
- Interfaz sin contenedor pequeño en móvil.
- Menos elementos encima del vídeo.
- Controles ocultables tocando el vídeo.
- HUD de fase activa grande y claro.
- Lectura visible de tiempo y frame estimado.
- Timeline inferior para moverse por el vídeo.
- Botones grandes para `-1f`, `Play`, `+1f` y `Marcar`.
- Fases principales con estado marcado/no marcado.
- Bottom dock compacto por modos: Calidad, Fases, Análisis e Historial.
- Guías DTL / Face-On con toggle.
- Modo Fill/Fit para llenar pantalla o ver el vídeo completo.
- Velocidad 1x / 0.5x / 0.25x.
- Subida de vídeo y grabación desde cámara móvil.
- Guardado local en IndexedDB con miniatura.
- Service Worker offline-first.
- Manifest PWA instalable.

## Uso recomendado

1. Abre la app en móvil.
2. Sube o graba un vídeo vertical.
3. Usa `Fill` para experiencia tipo Shorts. Usa `Fit` si necesitas ver el vídeo completo sin recorte.
4. Entra en `Fases`.
5. Selecciona una fase: Address, Takeaway, Top, Impact o Finish.
6. Usa la timeline y los botones `-1f` / `+1f` para encontrar el frame exacto.
7. Pulsa `Marcar`.
8. Repite con el resto de fases.
9. Ejecuta `Análisis`.
10. Guarda la sesión local.

## Instalación como PWA

Para que el modo instalable/offline funcione correctamente, súbela a un servidor HTTPS:

- GitHub Pages
- Cloudflare Pages
- Netlify
- Vercel
- cualquier hosting HTTPS estático

Abrir `index.html` directamente como archivo local puede permitir ver la app, pero el Service Worker y la instalación PWA necesitan HTTPS o `localhost`.

## Comprobaciones realizadas

- Sintaxis JS validada con Node.
- Manifest JSON validado.
- Service Worker validado.
- Estructura de assets comprobada.
- ZIP generado con todos los archivos necesarios.

## Limitaciones actuales

- El número de frame se estima a 30 fps porque el navegador no siempre expone el frame real del vídeo.
- El análisis es todavía visual/manual, no usa pose estimation real.
- Las guías todavía son fijas; en próximas versiones deberían poder moverse y escalarse.
