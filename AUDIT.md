# Swing Lab PWA v1.2.1 GLAB Audit

## Problema corregido

En algunos despliegues el botón **Motor** seguía mostrando `Motor: Local` porque el cliente `SwingLabOnlineEngine` no estaba cargando, normalmente por caché/service worker o porque faltaba la carpeta `engine/`.

## Solución

- Se mantiene `engine/online-engine.js`.
- Además, `app.js` incluye un cliente GLAB inline de seguridad.
- Aunque `engine/online-engine.js` no cargue, el botón **Motor** puede guardar la URL y llamar a `/api/health`.
- Cache del service worker actualizado a `swing-lab-glab-v121`.

## Comprobación esperada

Al pulsar **Motor** y pegar `https://xxxxx.trycloudflare.com`, la terminal de `cloudflared` debe mostrar una llamada a `/api/health` y GLAB debe responder.
