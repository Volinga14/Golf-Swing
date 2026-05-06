import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const indexHtml = await readFile(join(root, "app/index.html"), "utf8");
const mainJs = await readFile(join(root, "app/src/main.js"), "utf8");
const serviceWorker = await readFile(join(root, "app/service-worker.js"), "utf8");
const bundleJs = await readFile(join(root, "app/src/bundle.js"), "utf8");
const browserTest = await readFile(join(root, "tests/browser-headless-test.mjs"), "utf8");

assert.match(indexHtml, /v0\.5\.5 fix2 local-first/);
assert.match(indexHtml, /data-step="upload"/);
assert.match(indexHtml, /data-step="save"/);
assert.match(indexHtml, /id="historyVideoNotice"/);
assert.match(indexHtml, /id="phaseSnapshotStrip"/);
assert.match(indexHtml, /id="demoLearningToggle"/);
assert.match(indexHtml, /class="history-thumb"/);
assert.match(indexHtml, /src="\.\/src\/bundle\.js"/);

assert.match(mainJs, /APP_VERSION = "0\.5\.5-fix2"/);
assert.match(bundleJs, /SwingLabModules/);
assert.match(bundleJs, /function handleVideoLoadError/);
assert.match(mainJs, /Sesión histórica sin vídeo/);
assert.match(mainJs, /captureFrameSnapshots/);
assert.match(mainJs, /includeFrameSnapshots/);
assert.match(mainJs, /mediaStatus/);
assert.match(mainJs, /renderWorkflow/);
assert.match(mainJs, /if \(step === "frame"\) return runAutoAnalysis\(\)/);
assert.match(mainJs, /button.disabled = !hasPlayableVideo;/);
assert.match(mainJs, /const hasPlayableVideo = Boolean\(state.videoObjectUrl && !state.isHistoryOnly\)/);
assert.match(mainJs, /setDemoLearningEnabled/);

assert.match(serviceWorker, /APP_VERSION = "0\.5\.5-fix2"/);
assert.match(serviceWorker, /skipWaiting/);
assert.match(serviceWorker, /clients\.claim/);
assert.match(serviceWorker, /networkFirst/);

assert.match(browserTest, /findBrowser/);
assert.match(browserTest, /chromium/);

console.log("OK: workflow regression tests passed");
