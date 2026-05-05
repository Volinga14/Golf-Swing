import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appDir = join(root, "app");

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml"
};

await testStaticAssets();
await testBusinessLogic();
await testHttpServer();

console.log("OK: smoke tests passed");

async function testStaticAssets() {
  const indexHtml = await readText("app/index.html");
  const requiredIds = [
    "videoInput",
    "prepPanel",
    "swingVideo",
    "overlayCanvas",
    "frameSlider",
    "eventGrid",
    "orientationBadge",
    "autoAnalyzeBtn",
    "playbackRate",
    "fullscreenBtn",
    "toggleEvents",
    "centerGuideBtn",
    "overallScore",
    "metricList",
    "recommendationList",
    "explanationList",
    "historyList",
    "saveCorrectionBtn",
    "learningCount",
    "ballWorkspace",
    "ballVideo",
    "ballCanvas",
    "autoBallPathBtn",
    "ballPathStatus",
    "exportJsonBtn",
    "exportCsvBtn",
    "exportPngBtn"
  ];

  for (const id of requiredIds) {
    assert.match(indexHtml, new RegExp(`id="${id}"`), `Missing #${id}`);
  }

  const scriptMatches = [...indexHtml.matchAll(/src="\.\/([^"]+)"/g)].map((match) => match[1]);
  const hrefMatches = [...indexHtml.matchAll(/href="\.\/([^"]+)"/g)].map((match) => match[1]);
  const imgMatches = [...indexHtml.matchAll(/src="\.\/([^"]+\.svg)"/g)].map((match) => match[1]);
  for (const asset of [...scriptMatches, ...hrefMatches, ...imgMatches]) {
    assert.ok(existsSync(join(appDir, asset)), `Missing referenced asset: ${asset}`);
  }

  const serviceWorker = await readText("app/service-worker.js");
  const cacheEntries = [...serviceWorker.matchAll(/"\.\/([^"]*)"/g)].map((match) => match[1] || "index.html");
  for (const entry of cacheEntries) {
    const path = entry === "" ? "index.html" : entry;
    assert.ok(existsSync(join(appDir, path)), `Missing service worker cache entry: ${path}`);
  }
}

async function testBusinessLogic() {
  const { calculateMetrics } = await import(pathToFileURL(join(appDir, "src/metrics.js")).href);
  const { buildRecommendations } = await import(pathToFileURL(join(appDir, "src/recommendations.js")).href);
  const { buildAnalysis } = await import(pathToFileURL(join(appDir, "src/video-analysis.js")).href);
  const { buildTrajectoryFromDetections } = await import(pathToFileURL(join(appDir, "src/ball-tracking.js")).href);
  const { blendAnalysisWithLearning, correctionExampleCount } = await import(pathToFileURL(join(appDir, "src/learning.js")).href);

  const state = {
    viewType: "DTL",
    fps: 60,
    totalFrames: 180,
    events: { address: 12, top: 84, impact: 108, finish: 168 },
    captureChecks: { frame: true, light: true, stable: true, ball: true, club: true, fps: true },
    manualMetrics: { headStability: 72, postureRetention: 50, handPath: 58, finishBalance: 82 }
  };

  const metrics = calculateMetrics(state);
  assert.equal(metrics.eventsComplete, true);
  assert.equal(metrics.hasVideo, true);
  assert.equal(metrics.captureScore, 100);
  assert.equal(metrics.tempoRatio, 3);
  assert.ok(metrics.overallScore > 60);

  const report = buildRecommendations(state, metrics);
  assert.equal(report.primaryIssue, "Early extension probable");
  assert.match(report.drill.name, /Chair/i);

  const incomplete = calculateMetrics({ ...state, events: { address: null, top: null, impact: null, finish: null } });
  const incompleteReport = buildRecommendations(state, incomplete);
  assert.equal(incomplete.eventsComplete, false);
  assert.equal(incompleteReport.primaryIssue, "Faltan fases clave");

  const noVideo = calculateMetrics({ ...state, totalFrames: 0 });
  const noVideoReport = buildRecommendations({ ...state, totalFrames: 0 }, noVideo);
  assert.equal(noVideo.hasVideo, false);
  assert.equal(noVideo.overallScore, 0);
  assert.equal(noVideoReport.primaryIssue, "Vídeo pendiente");

  const unordered = calculateMetrics({ ...state, events: { address: 60, top: 50, impact: 108, finish: 168 } });
  const unorderedReport = buildRecommendations(state, unordered);
  assert.equal(unordered.eventsOrdered, false);
  assert.equal(unorderedReport.primaryIssue, "Fases fuera de orden");

  const samples = Array.from({ length: 48 }, (_, index) => ({
    index,
    time: index / 16,
    motion: index < 6 ? 1 : index < 18 ? 9 : index < 26 ? 2 : index < 34 ? 22 : 3,
    brightness: 120,
    contrast: 42
  }));
  const analysis = buildAnalysis({ samples, fps: 60, duration: 3, width: 1920, height: 1080 });
  assert.ok(analysis.events.address < analysis.events.top);
  assert.ok(analysis.events.top < analysis.events.impact);
  assert.ok(analysis.events.impact < analysis.events.finish);
  assert.equal(analysis.captureChecks.frame, true);
  assert.equal(analysis.captureChecks.light, true);

  const learned = blendAnalysisWithLearning(analysis, {
    videoName: "WhatsApp Video 2026-05-05 at 9.43.22 AM.mp4",
    fps: 60,
    duration: 3.5,
    totalFrames: 210,
    orientation: "horizontal",
    viewType: "DTL",
    club: "7-iron"
  });
  assert.equal(correctionExampleCount() >= 1, true);
  assert.equal(learned.events.address, 80);
  assert.equal(learned.events.top, 138);
  assert.equal(learned.events.impact, 155);
  assert.equal(learned.events.finish, 188);

  const trajectory = buildTrajectoryFromDetections(
    [
      { x: 0.55, y: 0.64, time: 2.62, score: 60 },
      { x: 0.62, y: 0.5, time: 2.82, score: 65 },
      { x: 0.72, y: 0.37, time: 3.04, score: 70 }
    ],
    { launchPoint: { x: 0.52, y: 0.72 }, impactTime: 2.58, result: "straight" }
  );
  assert.equal(trajectory.source, "vision");
  assert.ok(trajectory.points.length >= 4);
  assert.ok(trajectory.confidence > 50);
}

async function testHttpServer() {
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const filePath = resolve(appDir, "." + decodeURIComponent(safePath));
      assert.ok(filePath.startsWith(appDir), "Path traversal blocked");
      const body = await readFile(filePath);
      res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
      res.end(body);
    } catch (error) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(String(error.message || error));
    }
  });

  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  try {
    const base = `http://127.0.0.1:${port}`;
    for (const path of ["/", "/styles/main.css", "/src/main.js", "/manifest.json", "/service-worker.js"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, `HTTP ${path}`);
      assert.ok((await response.text()).length > 20, `Non-empty ${path}`);
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function readText(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}
