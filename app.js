const cfg = window.GLAB_CONFIG || {};
const els = {
  apiBase: document.getElementById("apiBase"),
  saveApiBtn: document.getElementById("saveApiBtn"),
  healthBtn: document.getElementById("healthBtn"),
  healthBadge: document.getElementById("healthBadge"),
  healthOutput: document.getElementById("healthOutput"),
  videoInput: document.getElementById("videoInput"),
  videoPreview: document.getElementById("videoPreview"),
  viewInput: document.getElementById("viewInput"),
  clubInput: document.getElementById("clubInput"),
  numFramesInput: document.getElementById("numFramesInput"),
  imageSizeInput: document.getElementById("imageSizeInput"),
  motionWindowInput: document.getElementById("motionWindowInput"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  progress: document.getElementById("progress"),
  summary: document.getElementById("summary"),
  phaseTable: document.getElementById("phaseTable"),
  eventTable: document.getElementById("eventTable"),
  jsonOutput: document.getElementById("jsonOutput"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn")
};

const LS_API = "glab_api_base";
const LS_HISTORY = "glab_swing_history_v1";
let selectedFile = null;

function normaliseBase(url) { return String(url || "").trim().replace(/\/+$/, ""); }
function getApiBase() { return normaliseBase(localStorage.getItem(LS_API) || cfg.defaultApiBase || "http://localhost:8000"); }
function setBadge(text, state) {
  els.healthBadge.textContent = text;
  els.healthBadge.className = "status-pill" + (state ? " " + state : "");
}
function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(3)} s`;
}
function renderTable(table, obj) {
  const entries = Object.entries(obj || {});
  table.innerHTML = entries.length ? entries.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join("") : "<tr><td>Sin datos</td></tr>";
}
function renderResult(data) {
  els.summary.innerHTML = data?.ok
    ? `<strong>OK</strong> · ${data.engine_version || data.source || "GLAB"} · ${data.checkpoint_name || ""}`
    : `<strong>Error / revisar</strong> · ${data?.error || "sin detalle"}`;
  renderTable(els.phaseTable, data?.phases);
  renderTable(els.eventTable, data?.events_8);
  els.jsonOutput.textContent = JSON.stringify(data, null, 2);
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]"); } catch { return []; }
}
function saveHistory(item) {
  const h = loadHistory();
  h.unshift(item);
  localStorage.setItem(LS_HISTORY, JSON.stringify(h.slice(0, 20)));
  renderHistory();
}
function renderHistory() {
  const h = loadHistory();
  els.historyList.innerHTML = h.length ? h.map(item => `
    <div class="historyItem">
      <strong>${item.file || "vídeo"}</strong><br/>
      ${item.date}<br/>
      ${item.ok ? "OK" : "Revisar"} · Impact: ${fmt(item.impact)} · Top: ${fmt(item.top)}
    </div>
  `).join("") : `<p class="subtitle">Sin historial local.</p>`;
}
async function checkHealth() {
  const base = getApiBase();
  try {
    setBadge("Comprobando...", "");
    const res = await fetch(base + (cfg.healthPath || "/api/health"));
    const data = await res.json();
    els.healthOutput.textContent = JSON.stringify(data, null, 2);
    if (res.ok && data.ok) setBadge("GLAB conectado", "ok");
    else setBadge("Health raro", "bad");
    return data;
  } catch (err) {
    els.healthOutput.textContent = String(err);
    setBadge("Sin conexión", "bad");
    throw err;
  }
}
async function analyze() {
  if (!selectedFile) {
    alert("Selecciona primero un vídeo.");
    return;
  }
  const base = getApiBase();
  const fd = new FormData();
  fd.append("file", selectedFile, selectedFile.name || "swing.mp4");
  fd.append("view", els.viewInput.value || "dtl");
  fd.append("club", els.clubInput.value || "unknown");
  fd.append("num_frames", els.numFramesInput.value || cfg.defaultNumFrames || 48);
  fd.append("image_size", els.imageSizeInput.value || cfg.defaultImageSize || 144);
  fd.append("use_motion_window", els.motionWindowInput.checked ? "true" : "false");

  els.progress.classList.remove("hidden");
  els.analyzeBtn.disabled = true;
  els.analyzeBtn.textContent = "Analizando...";
  try {
    const res = await fetch(base + (cfg.analyzePath || "/api/analyze"), { method: "POST", body: fd });
    const data = await res.json();
    renderResult(data);
    saveHistory({
      date: new Date().toLocaleString(),
      file: selectedFile.name,
      ok: !!data.ok,
      top: data?.phases?.top,
      impact: data?.phases?.impact
    });
  } catch (err) {
    renderResult({ ok: false, error: String(err) });
  } finally {
    els.progress.classList.add("hidden");
    els.analyzeBtn.disabled = false;
    els.analyzeBtn.textContent = "Analizar con GLAB";
  }
}

els.apiBase.value = getApiBase();
els.saveApiBtn.addEventListener("click", () => {
  localStorage.setItem(LS_API, normaliseBase(els.apiBase.value));
  setBadge("API guardada", "");
});
els.healthBtn.addEventListener("click", checkHealth);
els.analyzeBtn.addEventListener("click", analyze);
els.clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(LS_HISTORY);
  renderHistory();
});
els.videoInput.addEventListener("change", () => {
  selectedFile = els.videoInput.files?.[0] || null;
  if (selectedFile) {
    els.videoPreview.src = URL.createObjectURL(selectedFile);
    els.videoPreview.classList.add("ready");
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
renderHistory();
checkHealth().catch(() => {});
