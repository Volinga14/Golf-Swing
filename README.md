# SwingLab · 0.8 Preview

Aplicación de revisión de swing, con editor a pantalla completa, marcado local de fases, corrección manual del impacto, recorte temporal sin alterar el original, sesiones locales, comparación y exportación de informes.

## Probar en el móvil

Abre https://volinga14.github.io/Golf-Swing/ y elige **New analysis**. Al cargar un vídeo se abre el editor. Pulsa **Analizar**: primero ajusta el tramo con dos tiradores sobre la tira de fotogramas, sin salir del vídeo. Pulsa **Continuar** y después **Analizar swing**. Marcar el impacto es una ayuda opcional en el segundo paso. Guarda la sesión para conservar el tramo, las fases y el original. Las herramientas de dibujo, vista, capturas y revisión IA están agrupadas en **Más**.

El motor local actual propone fases en vista desde atrás (DTL). La vista frontal se puede revisar manualmente. El seguimiento corporal y de palo completo no está implementado todavía. Las herramientas de dibujo no representan mediciones automáticas.

Las sesiones de la aplicación anterior siguen en su base de datos independiente; el enlace **Abrir editor anterior y sus sesiones** está en Perfil → Help & testing. No se trasladan automáticamente a la nueva base. Abre el editor anterior con conexión para recuperar su contenido; no borres los datos del navegador.

## Android Studio

1. Clona este repositorio y abre la carpeta `android` en Android Studio.
2. Usa JDK 17 y permite descargar Android SDK 35 y Gradle 8.9. El wrapper está incluido.
3. Selecciona `app`, conecta el teléfono por USB con depuración habilitada y pulsa **Run**.
4. Los archivos web de la raíz se copian al APK al compilar. Tras editarlos, vuelve a ejecutar **Run**.

También puedes ejecutar:

```sh
cd android
./gradlew testDebugUnitTest assembleDebug
```

El paquete de esta entrega es `com.swinglab.mobile.preview` y se instala separado de la Beta anterior. No importa sus sesiones ni su conexión. Usa siempre la misma clave de firma local para actualizar Preview sin borrar sus datos. Los APK de CI tienen firma de depuración de su runner y no garantizan actualizaciones entre compilaciones; para pruebas repetidas es preferible Android Studio con la misma clave local. No se incluye ninguna clave privada en el repositorio.

La PWA permite revisar cambios web cuando se publican; el APK contiene una copia del código y requiere una compilación nueva para incorporar cambios. Una actualización web no modifica el APK instalado.

## Comprobaciones

```sh
npm install --ignore-scripts
npm test
npx playwright install chromium
npm run test:frontend
npm run test:browser
node tests/segment-preview-browser.cjs
```

GitHub Actions ejecuta las comprobaciones web y compila un APK Preview descargable desde el artefacto de la ejecución. La publicación de Pages conserva la configuración existente del repositorio.

## Estado del análisis avanzado

La conexión personal opcional en Android requiere autorización y disponibilidad del proveedor; no se activa automáticamente ni incluye una API key. El servicio comercial, pagos y sincronización no están conectados en esta Preview. Los vídeos permanecen locales salvo envío explícito de imágenes para revisión. Los ejemplos 3D actuales son auxiliares de pruebas; las demostraciones reales de ejercicios todavía deben producirse o licenciarse.
