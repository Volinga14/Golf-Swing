import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mainJs = await readFile(join(root, "app/src/main.js"), "utf8");
const videoPlayerJs = await readFile(join(root, "app/src/video-player.js"), "utf8");
const html = await readFile(join(root, "app/index.html"), "utf8");
const css = await readFile(join(root, "app/styles/main.css"), "utf8");

assert.match(videoPlayerJs, /return this\.objectUrl;/, "VideoPlayer.load must return the object URL immediately");
assert.match(mainJs, /function loadSelectedVideoFile\(file, existingObjectUrl = ""\)/, "Upload flow should be handled by a reusable function");
assert.match(mainJs, /const objectUrl = existingObjectUrl \|\| player\.load\(file\);/, "Upload handler should create/store the object URL immediately");
assert.match(mainJs, /state\.videoObjectUrl = objectUrl;/, "Upload handler should mark the session as having a video before metadata events");
assert.match(mainJs, /setAppStatus\("loaded", "Vídeo cargado"\);/, "Upload handler should move the UI out of the home screen while loading");
assert.match(mainJs, /swinglab:fallback-video-selected/, "Main app should accept the HTML fallback upload event");
assert.match(html, /window\.SwingLabUploadFallback/, "HTML should include a fallback upload handler that works even if module boot is delayed");
assert.match(html, /onchange="window\.SwingLabUploadFallback/, "File input should call fallback directly on selection");
assert.match(html, /<video id="swingVideo"[^>]*controls/, "Video should expose native controls as a fallback");
assert.match(css, /\.upload-drop input[\s\S]*inset: 0;[\s\S]*pointer-events: auto;/, "File input should cover the upload card and receive pointer events");
assert.match(mainJs, /loadeddata.*finalizeVideoLoad/s, "Video load should finalize on loadeddata as well as metadata");
assert.match(mainJs, /canplay.*finalizeVideoLoad/s, "Video load should finalize on canplay as well as metadata");
assert.match(mainJs, /error.*handleVideoLoadError/s, "Video load errors should be surfaced to the user");
assert.match(mainJs, /Prueba con MP4 H\.264/, "Unsupported-codec guidance should be shown when metadata cannot be read");
assert.doesNotMatch(mainJs.match(/function handleVideoLoadError\(\) \{[\s\S]*?\n\}/)?.[0] || "", /state\.videoObjectUrl = "";/, "Codec errors must not clear the selected video and return to the home screen");
assert.match(html, /homeLoadHistoryBtn[\s\S]*addEventListener/, "Home history button should have non-module fallback wiring");

console.log("OK: upload flow regression tests passed");
