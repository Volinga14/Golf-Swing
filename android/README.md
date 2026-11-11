# Android Preview

Abre esta carpeta en Android Studio. Requisitos: JDK 17 y Android SDK 35. El wrapper fija Gradle 8.9.

```sh
./gradlew testDebugUnitTest assembleDebug
```

`syncSwingLabAssets` copia el frontend de la raíz al paquete al compilar. El APK no carga automáticamente una nueva versión desde GitHub Pages. Después de modificar el frontend o el código Java, ejecuta Run otra vez.

Preview 0.7 usa `com.swinglab.mobile.preview` y el esquema de retorno `swinglab-preview`. Se instala junto a Beta sin alterar sus datos. Reutiliza tu firma local para poder actualizar Preview. El APK de CI es solo de pruebas y puede tener una firma distinta entre ejecuciones.

La conexión opcional a ChatGPT conserva el flujo de autorización del cliente existente. Su disponibilidad y permisos deben probarse en el teléfono. No se incluye una API key ni un servicio comercial de pago.
