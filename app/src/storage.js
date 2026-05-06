const DB_NAME = "swing-lab-ai";
const DB_VERSION = 2;
const STORE = "sessions";
let memorySessions = [];
let warnedStorageFallback = false;

export async function saveSession(session) {
  try {
    const db = await openDb();
    return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(session));
  } catch (error) {
    warnStorageFallback(error);
    const existing = memorySessions.findIndex((item) => item.id === session.id);
    if (existing >= 0) memorySessions[existing] = session;
    else memorySessions.unshift(session);
    return session.id;
  }
}

export async function listSessions() {
  try {
    const db = await openDb();
    const records = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    warnStorageFallback(error);
    return memorySessions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export async function getSession(id) {
  try {
    const db = await openDb();
    return requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
  } catch (error) {
    warnStorageFallback(error);
    return memorySessions.find((item) => item.id === id) || null;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this context."));
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab."));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function warnStorageFallback(error) {
  if (warnedStorageFallback) return;
  warnedStorageFallback = true;
  console.warn("Swing Lab storage fallback active", error?.message || error);
}
