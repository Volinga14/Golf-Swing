import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mainJs = await readFile(join(root, "app/src/main.js"), "utf8");
const videoPlayerJs = await readFile(join(root, "app/src/video-player.js"), "utf8");

assert.match(videoPlayerJs, /return this\.objectUrl;/, "VideoPlayer.load must return the object URL immediately");
assert.match(mainJs, /const objectUrl = player\.load\(file\);/, "Upload handler should store the object URL immediately");
assert.match(mainJs, /state\.videoObjectUrl = objectUrl;/, "Upload handler should mark the session as having a video before metadata events");
assert.match(mainJs, /setAppStatus\("loaded", "Vídeo cargando"\);/, "Upload handler should move the UI out of the home screen while loading");
assert.match(mainJs, /loadeddata.*finalizeVideoLoad/s, "Video load should finalize on loadeddata as well as metadata");
assert.match(mainJs, /canplay.*finalizeVideoLoad/s, "Video load should finalize on canplay as well as metadata");
assert.match(mainJs, /error.*handleVideoLoadError/s, "Video load errors should be surfaced to the user");
assert.match(mainJs, /Prueba con MP4 H\.264/, "Unsupported-codec guidance should be shown when metadata cannot be read");

console.log("OK: upload flow regression tests passed");
