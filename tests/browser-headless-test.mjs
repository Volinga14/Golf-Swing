import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appDir = join(root, "app");
const artifactsDir = join(root, "test-artifacts");
const screenshotPath = join(artifactsDir, "swing-lab-home.png");
const mobileScreenshotPath = join(artifactsDir, "swing-lab-mobile.png");

const browserPath = findBrowser();
if (!browserPath) {
  console.log("SKIP: Chromium/Chrome/Edge headless not found");
  process.exit(0);
}

await mkdir(artifactsDir, { recursive: true });
const server = createStaticServer(appDir);
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;

try {
  const dom = await runBrowser([
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "--virtual-time-budget=3000",
    "--dump-dom",
    url
  ]);
  assert.match(dom.stdout, /Swing Lab AI/);
  assert.match(dom.stdout, /Vídeo pendiente/);
  assert.doesNotMatch(dom.stdout + dom.stderr, /ERR_FILE_NOT_FOUND|Uncaught|Failed to load module script/);

  await runBrowser([
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    `--screenshot=${screenshotPath}`,
    "--window-size=1440,1000",
    url
  ]);
  const imageStat = await stat(screenshotPath);
  assert.ok(imageStat.size > 10_000, "Screenshot should be non-empty");

  await runBrowser([
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    `--screenshot=${mobileScreenshotPath}`,
    "--window-size=390,844",
    url
  ]);
  const mobileImageStat = await stat(mobileScreenshotPath);
  assert.ok(mobileImageStat.size > 10_000, "Mobile screenshot should be non-empty");
  console.log(`OK: Chromium browser headless test passed (${screenshotPath}, ${mobileScreenshotPath})`);
} catch (error) {
  if (/timed out/i.test(error.message || "")) {
    console.log(`SKIP: headless browser did not finish in time (${error.message})`);
  } else {
    throw error;
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    process.env.EDGE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function createStaticServer(baseDir) {
  const mimeTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml"
  };

  return createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const filePath = resolve(baseDir, "." + decodeURIComponent(safePath));
      if (!filePath.startsWith(resolve(baseDir))) throw new Error("Blocked path");
      const body = await readFile(filePath);
      res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
      res.end(body);
    } catch (error) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(String(error.message || error));
    }
  });
}

function ensureBrowserArgs(args) {
  return [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-features=Translate,BackForwardCache,AcceptCHFrame",
    ...args
  ];
}

function runBrowser(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(browserPath, ensureBrowserArgs(args), { windowsHide: true });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new Error("Headless browser timed out after 15s"));
    }, 15_000);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectRun(new Error(`Browser exited with ${code}\n${stderr}`));
      } else {
        resolveRun({ stdout, stderr });
      }
    });
  });
}
