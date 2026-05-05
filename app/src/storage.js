const DB_NAME = "swing-lab-ai";
const DB_VERSION = 1;
const STORE = "sessions";

export async function saveSession(session) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(session));
}

export async function listSessions() {
  const db = await openDb();
  const records = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getSession(id) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
