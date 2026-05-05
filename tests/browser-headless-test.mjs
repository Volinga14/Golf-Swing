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

const edgePath = findEdge();
if (!edgePath) {
  console.log("SKIP: Microsoft Edge headless not found");
  process.exit(0);
}

await mkdir(artifactsDir, { recursive: true });
const server = createStaticServer(appDir);
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;

try {
  const dom = await runEdge([
    "--headless=new",
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

  await runEdge([
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    `--screenshot=${screenshotPath}`,
    "--window-size=1440,1000",
    url
  ]);
  const imageStat = await stat(screenshotPath);
  assert.ok(imageStat.size > 10_000, "Screenshot should be non-empty");
  console.log(`OK: browser headless test passed (${screenshotPath})`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
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

function runEdge(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(edgePath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectRun(new Error(`Edge exited with ${code}\n${stderr}`));
      } else {
        resolveRun({ stdout, stderr });
      }
    });
  });
}
