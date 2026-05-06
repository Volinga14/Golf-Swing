import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const html = await readFile(join(root, "app/index.html"), "utf8");
const scriptMatch = html.match(/<script>\s*([\s\S]*?window\.SwingLabUploadFallback[\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "Fallback script should be present in HTML");

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      src: "",
      textContent: "",
      style: {},
      dataset: {},
      controls: false,
      muted: false,
      playsInline: false,
      classList: {
        values: new Set(),
        add(value) { this.values.add(value); },
        remove(value) { this.values.delete(value); },
        contains(value) { return this.values.has(value); }
      },
      listeners: {},
      loadCalled: 0,
      load() { this.loadCalled += 1; },
      addEventListener(type, cb) { this.listeners[type] = cb; }
    });
  }
  return elements.get(id);
}

const context = {
  console,
  URL: {
    createObjectURL(file) { return `blob:test-${file.name}`; },
    revokeObjectURL() {}
  },
  CustomEvent: class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  },
  document: {
    body: { dataset: {} },
    getElementById: element,
    listeners: {},
    addEventListener(type, cb) { this.listeners[type] = cb; }
  },
  window: {
    dispatches: [],
    dispatchEvent(event) { this.dispatches.push(event); }
  }
};
context.window.URL = context.URL;
context.window.document = context.document;
context.window.CustomEvent = context.CustomEvent;
context.window.console = console;

vm.createContext(context);
vm.runInContext(scriptMatch[1], context);

const file = { name: "swing-test.mp4" };
context.window.SwingLabUploadFallback({ target: { files: [file] } });

assert.equal(element("swingVideo").src, "blob:test-swing-test.mp4", "Fallback should set the main video src immediately");
assert.equal(element("ballVideo").src, "blob:test-swing-test.mp4", "Fallback should mirror the video in the ball view");
assert.equal(element("homeScreen").classList.contains("is-collapsed"), true, "Fallback should collapse the home screen");
assert.equal(element("swingWorkspace").classList.contains("has-video"), true, "Fallback should mark the workspace as having video");
assert.equal(element("emptyStage").style.display, "none", "Fallback should hide the empty stage");
assert.equal(element("appStateBadge").textContent, "Vídeo cargado", "Fallback should update the state badge");
assert.equal(context.document.body.dataset.uploadFallback, "ready", "Fallback should mark successful execution");
assert.equal(context.window.dispatches[0].type, "swinglab:fallback-video-selected", "Fallback should notify the main module");

context.document.listeners.DOMContentLoaded();
element("swingVideo").listeners.error();
assert.equal(context.document.body.dataset.uploadFallback, "unsupported", "Video codec errors should keep the workspace open with unsupported state");
assert.equal(element("homeScreen").classList.contains("is-collapsed"), true, "Unsupported videos should not return to the home screen");
assert.equal(element("emptyStage").style.display, "grid", "Unsupported videos should show an in-view message");
assert.equal(element("appStateBadge").textContent, "Formato no compatible", "Unsupported codec should be visible in the badge");

console.log("OK: upload fallback runtime test passed");
