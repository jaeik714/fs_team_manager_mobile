// 장부 파일(SQLite 파일 내용 전체)을 휴대폰 브라우저 저장소(IndexedDB)에 보관한다.
// 서버로 보내지 않는다. 브라우저 데이터를 지우면 함께 지워지므로 백업 내보내기가 필요하다.
const DB_NAME = "futsal-manager";
const STORE = "ledger";
const KEY = "current";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const idb = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    idb.close();
  }
}

/** 저장된 장부 { bytes: Uint8Array, savedAt } 또는 null */
export async function loadLedger() {
  return (await run("readonly", (s) => s.get(KEY))) ?? null;
}

/** 장부 저장 (항상 파일 전체를 통째로 저장) */
export async function saveLedger(bytes) {
  await run("readwrite", (s) => s.put({ bytes, savedAt: new Date().toISOString() }, KEY));
}

export async function clearLedger() {
  await run("readwrite", (s) => s.delete(KEY));
}

/** 브라우저가 저장 공간이 부족할 때 이 앱의 데이터를 지우지 않도록 요청 (지원할 때만) */
export async function requestPersist() {
  try {
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}

/** 불러오기 직전 장부를 안전 백업 1개로 보관 (되돌리기용, 매번 덮어씀) */
export async function saveSafetyCopy(bytes) {
  await run("readwrite", (s) => s.put({ bytes, savedAt: new Date().toISOString() }, "before_import"));
}
