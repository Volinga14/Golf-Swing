const DB_NAME = "pesacacas_health";
const DB_VERSION = 1;
const PHOTO_MAX_SIDE = 1280;
const PHOTO_QUALITY = 0.78;
const VITRUVIO_SRC = "./assets/vitruvio-pesaca.svg";
const VITRUVIO_REF_KEY = "pesaca_vitruvio_ref_pct";
const VITRUVIO_DEFAULT_REF = 2;

let deferredInstallPrompt = null;
let photoDraft = null;
let lastPhotoToAttach = null;

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("events")) {
        const store = db.createObjectStore("events", { keyPath: "id" });
        store.createIndex("datetimeISO", "datetimeISO", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getEvents() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("events").objectStore("events").getAll();
    req.onsuccess = () => {
      const rows = (req.result || []).slice().sort((a, b) => (b.datetimeISO || "").localeCompare(a.datetimeISO || ""));
      db.close();
      resolve(rows);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function putEvent(event) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("events", "readwrite").objectStore("events").put(event);
    req.onsuccess = () => {
      db.close();
      resolve(true);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function deleteEvent(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("events", "readwrite").objectStore("events").delete(id);
    req.onsuccess = () => {
      db.close();
      resolve(true);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 2200);
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function installLogo() {
  const mark = document.querySelector(".brand__mark");
  if (!mark || mark.querySelector("img")) return;
  mark.innerHTML = `<img src="./assets/pesaca-mark.svg?v=9" alt="" />`;
}

function ensureInstallUI() {
  const topbar = document.querySelector(".topbar");
  const app = $("app");
  if (!topbar || !app) return;

  if (!$("installBanner")) {
    topbar.insertAdjacentHTML("afterend", `
      <aside id="installBanner" class="installBanner hidden" aria-live="polite">
        <div>
          <strong>Instala PESACA</strong>
          <span>Acceso directo, pantalla completa y uso offline en el movil.</span>
        </div>
        <button id="installBannerBtn" class="secondaryButton" type="button">Instalar</button>
        <button id="dismissInstall" class="iconButton" type="button" title="Ocultar" aria-label="Ocultar instalacion">x</button>
      </aside>
    `);
  }

  if (!$("modalInstall")) {
    app.insertAdjacentHTML("beforeend", `
      <dialog id="modalInstall" class="modal">
        <div class="modal__body">
          <div class="modal__title">Instalar en el movil</div>
          <div class="modalText">
            <p>En Android, pulsa Instalar si aparece el aviso del navegador. Si no aparece, abre el menu del navegador y elige Anadir a pantalla de inicio.</p>
            <p>En iPhone, usa Compartir y despues Anadir a pantalla de inicio.</p>
            <p>Una vez instalada, PESACA abre como app y conserva el modo offline.</p>
          </div>
          <div class="modal__actions">
            <button id="closeInstall" class="secondaryButton" type="button">Cerrar</button>
          </div>
        </div>
      </dialog>
    `);
  }

  const banner = $("installBanner");
  const modal = $("modalInstall");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const likelyMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 720;
  const showBanner = () => {
    if (!isStandalone && likelyMobile && localStorage.getItem("pesaca_install_dismissed") !== "1") {
      banner.classList.remove("hidden");
    }
  };
  const startInstall = async () => {
    if (isStandalone) {
      toast("PESACA ya esta instalada.");
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      banner.classList.add("hidden");
      return;
    }
    modal.showModal();
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showBanner();
  });
  $("installBtn")?.addEventListener("click", startInstall);
  $("installBannerBtn")?.addEventListener("click", startInstall);
  $("dismissInstall")?.addEventListener("click", () => {
    localStorage.setItem("pesaca_install_dismissed", "1");
    banner.classList.add("hidden");
  });
  $("closeInstall")?.addEventListener("click", () => modal.close());
  window.addEventListener("appinstalled", () => {
    banner.classList.add("hidden");
    toast("PESACA instalada.");
  });
  showBanner();
}

function ensurePhotoUI() {
  const formPreview = $("formPreview");
  if (!formPreview || $("photoPreview")) return;
  formPreview.insertAdjacentHTML("beforebegin", `
    <fieldset class="formBlock photoBlock">
      <legend>Foto</legend>
      <div class="photoActions">
        <button id="takePhoto" class="secondaryButton" type="button">Sacar foto</button>
        <button id="pickPhoto" class="secondaryButton" type="button">Anadir foto</button>
      </div>
      <input id="f_photo_camera" class="visuallyHidden" type="file" accept="image/*" capture="environment" />
      <input id="f_photo_gallery" class="visuallyHidden" type="file" accept="image/*" />
      <div id="photoPreview" class="photoPreview hidden">
        <img id="photoPreviewImg" alt="Foto seleccionada" />
        <div class="photoPreview__meta">
          <strong id="photoPreviewName">Foto preparada</strong>
          <span id="photoPreviewSize">Lista para guardar con el registro.</span>
        </div>
        <button id="removePhoto" class="rowDelete" type="button" title="Quitar foto" aria-label="Quitar foto">x</button>
      </div>
    </fieldset>
  `);
}

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve({
          data: canvas.toDataURL("image/jpeg", PHOTO_QUALITY),
          name: file.name || "foto.jpg",
          originalSize: file.size || 0,
          width,
          height,
          capturedAt: new Date().toISOString(),
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoPreview() {
  const wrap = $("photoPreview");
  const img = $("photoPreviewImg");
  const name = $("photoPreviewName");
  const size = $("photoPreviewSize");
  if (!wrap || !img || !name || !size) return;
  if (!photoDraft) {
    wrap.classList.add("hidden");
    img.removeAttribute("src");
    name.textContent = "Foto preparada";
    size.textContent = "Lista para guardar con el registro.";
    return;
  }
  img.src = photoDraft.data;
  name.textContent = photoDraft.name;
  size.textContent = `${photoDraft.width} x ${photoDraft.height}px - ${formatBytes(photoDraft.originalSize)}`;
  wrap.classList.remove("hidden");
}

async function handlePhoto(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("Selecciona una imagen valida.");
    return;
  }
  try {
    photoDraft = await resizePhoto(file);
    renderPhotoPreview();
    toast("Foto anadida.");
  } catch (error) {
    console.warn(error);
    toast("No se pudo preparar la foto.");
  }
}

async function attachPhotoToNewest() {
  const photo = lastPhotoToAttach;
  if (!photo) return;
  try {
    const events = await getEvents();
    const target = events
      .filter((ev) => !ev.photoData)
      .sort((a, b) => (b.createdAt || b.datetimeISO || "").localeCompare(a.createdAt || a.datetimeISO || ""))[0];
    if (!target) return;
    await putEvent({
      ...target,
      photoData: photo.data,
      photoName: photo.name,
      photoCapturedAt: photo.capturedAt,
    });
    lastPhotoToAttach = null;
    renderHistoryCards();
  } catch (error) {
    console.warn(error);
  }
}

function bindPhotoUI() {
  ensurePhotoUI();
  const camera = $("f_photo_camera");
  const gallery = $("f_photo_gallery");
  const form = $("newForm");
  if (!camera || camera.dataset.v9Bound) return;
  camera.dataset.v9Bound = "1";
  $("takePhoto")?.addEventListener("click", () => camera.click());
  $("pickPhoto")?.addEventListener("click", () => gallery.click());
  camera.addEventListener("change", () => handlePhoto(camera.files?.[0]));
  gallery.addEventListener("change", () => handlePhoto(gallery.files?.[0]));
  $("removePhoto")?.addEventListener("click", () => {
    photoDraft = null;
    lastPhotoToAttach = null;
    camera.value = "";
    gallery.value = "";
    renderPhotoPreview();
  });
  $("resetForm")?.addEventListener("click", () => {
    photoDraft = null;
    lastPhotoToAttach = null;
    renderPhotoPreview();
  });
  form?.addEventListener("submit", () => {
    if (!photoDraft) return;
    lastPhotoToAttach = { ...photoDraft };
    window.setTimeout(attachPhotoToNewest, 650);
    window.setTimeout(attachPhotoToNewest, 1600);
    window.setTimeout(() => {
      photoDraft = null;
      renderPhotoPreview();
    }, 1800);
  }, true);
}

function ensureHistoryCards() {
  const table = document.querySelector(".tableFrame");
  if (!table || $("historyCards")) return;
  table.insertAdjacentHTML("afterend", `<div id="historyCards" class="historyCards" aria-label="Registros en formato movil"></div>`);
}

function matchQuery(ev, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    ev.color,
    ev.mood,
    ev.food,
    ev.meds,
    ev.symptoms,
    ev.notes,
    ev.density,
    ev.urgency,
    ev.photoName,
    (ev.tags || []).join(" "),
  ].join(" ").toLowerCase().includes(q);
}

function inRange(ev, from, to) {
  const d = new Date(ev.datetimeISO);
  if (from && d < new Date(`${from}T00:00:00`)) return false;
  if (to && d > new Date(`${to}T23:59:59`)) return false;
  return true;
}

function compactContext(ev) {
  const parts = [
    ev.urgency ? `Urg. ${ev.urgency}` : "",
    ev.density || "",
    ev.waterL ? `${ev.waterL}L agua` : "",
    ev.photoData ? "Foto" : "",
    ev.tags?.length ? ev.tags.slice(0, 3).join(", ") : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : "-";
}

function cardHTML(ev) {
  const flags = [
    ev.blood ? "Sangre" : "",
    ev.mucus ? "Moco" : "",
    ev.urgency === "alta" ? "Urgente" : "",
  ].filter(Boolean);
  return `
    <article class="historyCard">
      <div class="historyCard__top">
        <div>
          <strong>${escapeHTML(formatDateTime(ev.datetimeISO))}</strong>
          <span>${escapeHTML(compactContext(ev))}</span>
        </div>
        <button class="rowDelete" type="button" title="Borrar" aria-label="Borrar registro" data-v9-del="${escapeHTML(ev.id)}">x</button>
      </div>
      <div class="historyFacts">
        <span><b>${typeof ev.weightG === "number" ? `${Math.round(ev.weightG)} g` : "-"}</b>Peso</span>
        <span><b>${ev.bristol ? escapeHTML(ev.bristol) : "-"}</b>Bristol</span>
        <span><b>${typeof ev.durationMin === "number" ? `${escapeHTML(ev.durationMin)} min` : "-"}</b>Dur.</span>
        <span><b>${flags.length ? escapeHTML(flags.join(", ")) : "-"}</b>Senales</span>
      </div>
      ${ev.photoData ? `<img class="historyPhoto" src="${escapeHTML(ev.photoData)}" alt="Foto del registro" />` : ""}
    </article>
  `;
}

async function renderHistoryCards() {
  ensureHistoryCards();
  const cards = $("historyCards");
  if (!cards) return;
  try {
    const from = $("h_from")?.value || "";
    const to = $("h_to")?.value || "";
    const query = $("h_q")?.value.trim() || "";
    const filtered = (await getEvents()).filter((ev) => inRange(ev, from, to) && matchQuery(ev, query));
    cards.innerHTML = filtered.length
      ? filtered.map(cardHTML).join("")
      : `<div class="historyCard">No hay registros con estos filtros.</div>`;
    $$("[data-v9-del]", cards).forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Borrar este registro?")) return;
        await deleteEvent(btn.getAttribute("data-v9-del"));
        toast("Registro borrado.");
        location.reload();
      });
    });
  } catch (error) {
    console.warn(error);
  }
}

function bindHistoryCards() {
  ensureHistoryCards();
  ["h_from", "h_to", "h_q"].forEach((id) => $(id)?.addEventListener("input", renderHistoryCards));
  $("h_clear")?.addEventListener("click", () => window.setTimeout(renderHistoryCards, 0));
  window.addEventListener("hashchange", () => {
    if (location.hash.replace("#", "") === "history") window.setTimeout(renderHistoryCards, 50);
  });
  window.setTimeout(renderHistoryCards, 300);
}

function fixVitruvioImage() {
  $$(".vitruvioBase, .vitruvioFill img").forEach((img) => {
    if (img.getAttribute("src") !== VITRUVIO_SRC) {
      img.setAttribute("src", VITRUVIO_SRC);
    }
  });
}

function readVitruvioReference() {
  const saved = Number(localStorage.getItem(VITRUVIO_REF_KEY));
  return [1, 2, 3, 5].includes(saved) ? saved : VITRUVIO_DEFAULT_REF;
}

function readEvacuatedPercent() {
  const text = $("pctEvac")?.textContent || "";
  const match = text.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function syncVitruvioScale() {
  const art = document.querySelector(".vitruvioArt");
  const rect = $("v9BodyFillRect");
  if (!art || !rect) return;

  const realPercent = readEvacuatedPercent();
  const reference = readVitruvioReference();
  const visualPercent = Math.min(100, Math.max(0, (realPercent / reference) * 100));
  const height = (300 * visualPercent) / 100;

  art.style.setProperty("--v9-fill", `${visualPercent}%`);
  rect.setAttribute("y", String(300 - height));
  rect.setAttribute("height", String(height));

  const fillText = $("v9VisualFillText");
  if (fillText) fillText.textContent = `${Math.round(visualPercent)}% visual`;

  const refText = $("v9VisualScaleText");
  if (refText) refText.textContent = `Lleno = ${reference}% del peso corporal`;

  const select = $("v9VitruvioScale");
  if (select && select.value !== String(reference)) select.value = String(reference);
}

function ensureVitruvioScaleControl() {
  const readout = document.querySelector(".vitruvioReadout");
  if (!readout || $("v9VitruvioScale")) return;

  readout.insertAdjacentHTML(
    "afterend",
    `
      <div class="v9ScaleControl" aria-label="Ajuste de referencia visual">
        <div>
          <span class="v9ScaleLabel">Referencia visual</span>
          <strong id="v9VisualScaleText">Lleno = 2% del peso corporal</strong>
        </div>
        <select id="v9VitruvioScale">
          <option value="1">Mas visible</option>
          <option value="2">Normal</option>
          <option value="3">Mas suave</option>
          <option value="5">Muy suave</option>
        </select>
      </div>
    `,
  );

  const select = $("v9VitruvioScale");
  select.value = String(readVitruvioReference());
  select.addEventListener("change", () => {
    localStorage.setItem(VITRUVIO_REF_KEY, select.value);
    syncVitruvioScale();
  });
}

function ensureSimpleVitruvio() {
  const art = document.querySelector(".vitruvioArt");
  if (!art) return;

  if (art.dataset.v9SimpleMeter !== "1") {
    art.classList.add("v9SimpleMeter");
    art.dataset.v9SimpleMeter = "1";
    art.setAttribute("role", "img");
    art.setAttribute("aria-label", "Medidor visual del porcentaje corporal evacuado");
    art.innerHTML = `
      <div id="vitruvioFill" class="vitruvioFill v9LegacyFill" aria-hidden="true"></div>
      <svg class="v9BodyMeter" viewBox="0 0 280 300" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="v9FillGradient" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stop-color="#7a431f" />
            <stop offset="0.52" stop-color="#a96b32" />
            <stop offset="1" stop-color="#d9a15b" />
          </linearGradient>
          <clipPath id="v9BodyClip">
            <circle cx="140" cy="46" r="23" />
            <rect x="129" y="66" width="22" height="24" rx="10" />
            <path d="M101 92 C112 79 128 74 140 74 C152 74 168 79 179 92 C194 111 196 157 187 195 C181 216 160 211 158 192 L154 136 L126 136 L122 192 C120 211 99 216 93 195 C84 157 86 111 101 92 Z" />
            <path d="M100 101 C76 113 57 148 52 188 C50 201 65 207 72 194 C82 164 94 139 111 124 Z" />
            <path d="M180 101 C204 113 223 148 228 188 C230 201 215 207 208 194 C198 164 186 139 169 124 Z" />
            <path d="M121 197 L138 197 L130 280 C129 290 122 295 111 295 L97 295 C88 295 86 288 92 280 Z" />
            <path d="M142 197 L159 197 L188 280 C194 288 192 295 183 295 L169 295 C158 295 151 290 150 280 Z" />
          </clipPath>
        </defs>
        <g class="v9BodyShadow">
          <circle cx="140" cy="46" r="23" />
          <rect x="129" y="66" width="22" height="24" rx="10" />
          <path d="M101 92 C112 79 128 74 140 74 C152 74 168 79 179 92 C194 111 196 157 187 195 C181 216 160 211 158 192 L154 136 L126 136 L122 192 C120 211 99 216 93 195 C84 157 86 111 101 92 Z" />
          <path d="M100 101 C76 113 57 148 52 188 C50 201 65 207 72 194 C82 164 94 139 111 124 Z" />
          <path d="M180 101 C204 113 223 148 228 188 C230 201 215 207 208 194 C198 164 186 139 169 124 Z" />
          <path d="M121 197 L138 197 L130 280 C129 290 122 295 111 295 L97 295 C88 295 86 288 92 280 Z" />
          <path d="M142 197 L159 197 L188 280 C194 288 192 295 183 295 L169 295 C158 295 151 290 150 280 Z" />
        </g>
        <rect id="v9BodyFillRect" x="35" y="300" width="210" height="0" fill="url(#v9FillGradient)" clip-path="url(#v9BodyClip)" />
        <g class="v9BodyOutline">
          <circle cx="140" cy="46" r="23" />
          <rect x="129" y="66" width="22" height="24" rx="10" />
          <path d="M101 92 C112 79 128 74 140 74 C152 74 168 79 179 92 C194 111 196 157 187 195 C181 216 160 211 158 192 L154 136 L126 136 L122 192 C120 211 99 216 93 195 C84 157 86 111 101 92 Z" />
          <path d="M100 101 C76 113 57 148 52 188 C50 201 65 207 72 194 C82 164 94 139 111 124 Z" />
          <path d="M180 101 C204 113 223 148 228 188 C230 201 215 207 208 194 C198 164 186 139 169 124 Z" />
          <path d="M121 197 L138 197 L130 280 C129 290 122 295 111 295 L97 295 C88 295 86 288 92 280 Z" />
          <path d="M142 197 L159 197 L188 280 C194 288 192 295 183 295 L169 295 C158 295 151 290 150 280 Z" />
        </g>
      </svg>
      <div class="v9MeterLegend">
        <strong id="v9VisualFillText">0% visual</strong>
        <span>relleno del medidor</span>
      </div>
    `;
  }

  ensureVitruvioScaleControl();
  syncVitruvioScale();
}

function watchVitruvioPercent() {
  const pct = $("pctEvac");
  if (!pct || pct.dataset.v9Observed === "1") return;
  pct.dataset.v9Observed = "1";
  new MutationObserver(syncVitruvioScale).observe(pct, {
    characterData: true,
    childList: true,
    subtree: true,
  });
}

function refreshServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=11").catch((error) => console.warn("SW v11", error));
  });
}

function main() {
  installLogo();
  ensureInstallUI();
  bindPhotoUI();
  bindHistoryCards();
  fixVitruvioImage();
  ensureSimpleVitruvio();
  watchVitruvioPercent();
  window.setTimeout(() => {
    ensureSimpleVitruvio();
    watchVitruvioPercent();
  }, 500);
  refreshServiceWorker();
}

main();
