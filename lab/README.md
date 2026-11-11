# Laboratorio de marcado — protocolo 1.0

Este módulo propone fases; no calcula calidad técnica, puntuaciones ni consejos. GLAB se conserva sin modificar. El candidato `Local Mark v0.2` es una exportación congelada de sus pesos para ejecutar dentro del navegador: **no es un modelo nuevo ni una arquitectura independiente**.

## Definiciones cerradas para esta primera iteración

| Fase | Criterio de marcado |
|---|---|
| Address | Último fotograma de la preparación estable antes del inicio continuo del backswing. Excluir waggles y ajustes anteriores. |
| Takeaway | Primer fotograma con la varilla aproximadamente horizontal en el backswing. Se mantiene el nombre de la app, pero corresponde explícitamente a `toe_up` de GLAB. No significa inicio de movimiento. |
| Top | Transición del palo entre subida y downswing. Si hay una pausa, último fotograma antes de bajar. |
| Impact | Primer fotograma de contacto visible o salida de la bola. Si no se ve, intervalo de incertidumbre o sin resolver con motivo. |
| Finish | Primer fotograma de la posición final sostenida tras el follow-through. Nunca sustituirlo automáticamente por el final del clip. Si no está incluido, sin resolver. |

Son decisiones operativas versionadas, no una declaración de que todas las etiquetas históricas ya sigan el mismo criterio. Un cambio futuro de definición requiere otra versión del protocolo y nueva revisión de las referencias.

## Uso

Abrir `lab/` en la app. La página permite seleccionar varios vídeos, asociarlos por SHA-256 con las referencias, avanzar en pasos de 20 ms, marcar el instante actual, indicar incertidumbre o ausencia, guardar borrador o confirmar una referencia revisada. Los tiempos se almacenan en segundos del archivo original, no en porcentajes ni con una tasa de 30 fps supuesta.

Para abrir las siete muestras privadas ya preparadas en este equipo:

```sh
node tools/serve-marking-lab.cjs ../audit/marking-references
```

Abrir `http://127.0.0.1:8086/lab/` y pulsar **Cargar muestras de este equipo**. El servidor escucha solo en loopback. Los vídeos se copian al almacenamiento de este navegador. En la versión publicada primero se importa `manifest.json` desde esa carpeta privada y después se seleccionan los vídeos con **Abrir vídeos**. Tanto los vídeos privados como sus tiempos, huellas y resultados se conservan fuera del repositorio público.

## Referencias y comparación

- La distribución pública arranca sin referencias. El paquete privado local contiene seis correcciones antiguas de Swing Lab como **borradores**, pendientes de revisión con estas definiciones, y un control negativo sintético.
- Se conservan los resultados del GLAB real ejecutado en Python con 48 imágenes, tamaño 144 y ventana por movimiento. Son instantáneas por vídeo y checkpoint, no respuestas simuladas.
- El mismo vídeo se verifica por su huella. No se comparan marcas contra otro archivo con el mismo nombre.
- La referencia importada se conserva; cada guardado añade la versión anterior al historial. Recuperar una versión o la referencia original crea un borrador que debe guardarse explícitamente.
- Las predicciones de cada motor no cambian al editar la referencia. Las diferencias se recalculan contra la referencia guardada.
- Los borradores no se incluyen en el error agregado. Se muestran MAE, mediana, P95, cobertura, fases ausentes y falsos análisis en controles negativos. Los aciertos por ±1/3/5 fotogramas requieren CFR verificado; la tasa nominal del contenedor no basta. Los intervalos de incertidumbre se conservan y el núcleo calcula también la distancia a ese intervalo.
- Exportar guarda protocolo, huellas, tiempos, resultados, revisores e historial, **sin vídeos**. Importar valida el protocolo, los límites temporales y las huellas.

Este conjunto es de desarrollo y sus etiquetas aún no están todas revisadas. No es un benchmark independiente y no demuestra generalización a jugadores nuevos. Ambos motores comparten pesos: las diferencias pueden proceder de la decodificación del vídeo, el muestreo, el redimensionado y el runtime, no de una red mejor.

## Candidato local

CNN por imagen y BiGRU temporal exportadas por separado en ONNX. Se procesa una imagen por vez para limitar el pico de memoria. La inferencia usa ONNX Runtime Web 1.23.2 con WebAssembly de un hilo en un Worker y recursos del mismo sitio: no hay CDN ni servicio remoto en el recorrido local.

El muestreo de movimiento y la ventana se calculan sin acceder a las referencias. La propuesta usa 48 imágenes de 144×144 y conserva los instantes muestreados. La configuración de entrenamiento del checkpoint fue 64/160; 48/144 coincide con la API evaluada y se identifica como limitación.

Se rechazan imágenes casi uniformes o sin movimiento antes de la red. Esto corrige el control negro, pero **no es un clasificador general de presencia de swing**: una cámara moviéndose u otra acción podría pasar. Toda propuesta queda pendiente de revisión. El modelo solo se ofrece para DTL y el recorte cuadrado central puede eliminar cuerpo o palo.

Pesos: unos 2,06 MB. El runtime WASM de 11,9 MB se distribuye comprimido en seis partes que suman 3,07 MB y se verifica por SHA-256 al descomprimir. Hace falta un navegador con WebAssembly y DecompressionStream. **Preparar sin conexión** conserva explícitamente esos recursos; los vídeos permanecen en IndexedDB. El primer uso necesita unos 5,3 MB de descarga de modelo y motor. La compresión reduce la descarga, no la memoria de ejecución.

## GLAB real y exportación de resultados

El botón **Enviar a GLAB** es el único recorrido que envía el vídeo a un servicio. Se indica la URL y se utiliza `/api/analyze`. Se impone un límite de 60 segundos y se conserva el resultado anterior si falla o se cancela. Importar un resultado exige la huella del vídeo y el protocolo.

Para ejecutar el código GLAB en Python y generar un resultado importable sin iniciar un servidor:

```sh
python tools/export-glab-result.py --runtime C:/PROYECTOSIA/GLAB/glab-runtime --video RUTA/clip.mp4 --out resultado-glab.json
```

Ejecutar con el entorno Python que ya contiene PyTorch y OpenCV. No modifica el motor ni entrena; escribe únicamente la salida indicada.

## Pruebas

```sh
npm test
npm run test:marking
```

La segunda orden usa Playwright, con las mismas variables `PLAYWRIGHT_MODULE_PATH` y `BROWSER_EXECUTABLE` que las pruebas existentes. Comprueba paridad numérica de los dos ONNX frente a PyTorch, referencias, revisión y persistencia, vídeo real, control negativo y ejecución sin conexión. Las pruebas con vídeos privados se omiten si no está preparada la carpeta local.

Antes de usarlo como marcado automático de producción quedan: revisar todas las etiquetas, añadir vistas/velocidades/diversidad, establecer un conjunto independiente, medir en Android/iPhone y mejorar la detección de swing y la precisión temporal de Impact.

Para reproducir los ONNX y las salidas de paridad en una carpeta nueva, usar `python tools/export-local-model.py --runtime RUTA/glab-runtime --out RUTA/nueva-exportacion` con PyTorch y ONNX 1.19.1 disponibles. No sobrescribe la distribución ni modifica GLAB; verificar la paridad antes de sustituir los modelos.

El laboratorio y la app comparten ahora `local-engine.js`. La versión 0.2 usa un decodificador separado del reproductor visible y tiempos de presentación del vídeo cuando son compatibles. Los pesos se conservan; la integración no implica un nuevo entrenamiento. La app principal añade correcciones, ventanas y exportación para revisión según [el flujo de aprendizaje](../TRAINING.md).
