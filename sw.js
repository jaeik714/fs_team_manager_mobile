// Service Worker — 앱 파일 전체를 휴대폰에 저장해 두고(캐시), 인터넷이 없어도 앱이 열리게 한다.
// - 앱 파일(이 저장소)만 저장한다. 장부는 IndexedDB 에 따로 있고, GitHub 동기화(api.github.com)는 저장하지 않고 늘 인터넷으로.
// - 새 버전을 올릴 때는 VERSION 을 바꾼다 → 휴대폰이 새 파일을 받아 두고, 앱 화면에 [새 버전 적용]을 띄운다.
// - FILES 에 빠진 파일이 있으면 tests/sw.test.js 가 실패한다.
const VERSION = "0.6.0";
const CACHE = `futsal-manager-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/state.js",
  "js/ui.js",
  "js/theme.js",
  "js/db/schema.js",
  "js/db/repo.js",
  "js/db/write.js",
  "js/db/storage.js",
  "js/db/backup.js",
  "js/db/secure.js",
  "js/db/cloud.js",
  "js/views/home.js",
  "js/views/dues.js",
  "js/views/bank.js",
  "js/views/members.js",
  "js/views/backup.js",
  "js/views/settings.js",
  "js/views/share.js",
  "js/share/report.js",
  "vendor/sql.js/sql-wasm.js",
  "vendor/sql.js/sql-wasm.wasm",
  "fonts/Pretendard-subset.woff2",
  "fonts/BlackHanSans-subset.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.png",
];

self.addEventListener("install", (event) => {
  // 서버에서 새로 받아(브라우저 캐시 무시) 전부 저장. 하나라도 실패하면 설치하지 않음(반쪽 앱 방지)
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("futsal-manager-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// 화면에서 [새 버전 적용]을 누르면 기다리던 새 버전으로 바로 바꾼다
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data === "version") event.source?.postMessage({ version: VERSION });
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // GitHub API 등은 그대로 인터넷으로
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 앱 화면 열기(주소 입력·홈 화면 아이콘)는 저장된 index.html
    const hit = req.mode === "navigate" ? await cache.match("index.html") : await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      return new Response("인터넷에 연결되어 있지 않습니다.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
