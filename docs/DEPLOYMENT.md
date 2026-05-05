# Publicación en GitHub Pages

Esta PWA está preparada para publicarse con GitHub Pages mediante GitHub Actions.

## Opción recomendada

1. Crea un repositorio en GitHub, por ejemplo `golf-swing-ai`.
2. Sube todo el contenido de la carpeta `golf-swing-ai`.
3. En GitHub, ve a `Settings -> Pages`.
4. En `Build and deployment`, selecciona `GitHub Actions`.
5. Haz push a `main`.

El workflow `.github/workflows/pages.yml` ejecuta los smoke tests y publica la carpeta `app`.

## URL esperada

Si el repo se llama `golf-swing-ai`, la URL suele ser:

`https://TU_USUARIO.github.io/golf-swing-ai/`

## Pruebas locales

```powershell
cd golf-swing-ai
node ./tests/smoke-test.mjs
node ./tests/browser-headless-test.mjs
python -m http.server 5174 --bind 127.0.0.1 --directory ./app
```

Abre `http://127.0.0.1:5174/`.
