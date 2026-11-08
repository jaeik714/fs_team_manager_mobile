// GitHub 비공개 저장소로 장부 주고받기 — PC data/cloud_sync.py 와 같은 방식.
// 올리는 것은 비밀번호로 잠근 파일(.fmbk, secure.js) 하나뿐. 공개 저장소에는 올리지 않는다.
// 연결 정보(저장소·토큰·비밀번호)는 이 휴대폰의 IndexedDB(meta.cloud)에만 저장한다.
import { compareFreshness, getSettings } from "./repo.js";
import { lock, readMeta, unlock } from "./secure.js";

export const DEFAULT_FILE = "futsal_ledger.fmbk";
const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const FILE_RE = /^[A-Za-z0-9._/-]+\.fmbk$/;

export class CloudError extends Error {}
export class RemoteIsNewer extends CloudError {
  constructor(message, remoteMeta) {
    super(message);
    this.remoteMeta = remoteMeta;
  }
}

/** 입력값 검사 후 저장할 연결 정보 */
export function makeConfig({ repo, token, file = DEFAULT_FILE, apiBase = "" }) {
  repo = String(repo ?? "").trim();
  file = String(file || DEFAULT_FILE).trim();
  token = String(token ?? "").trim();
  if (!REPO_RE.test(repo)) throw new CloudError("저장소는 '아이디/저장소이름' 형식으로 입력하세요. (예: jaeik714/fs_team_manager_data)");
  if (!FILE_RE.test(file) || file.includes("..")) throw new CloudError("파일 이름은 영문·숫자로 된 .fmbk 파일이어야 합니다.");
  if (!token) throw new CloudError("접속 토큰을 입력하세요.");
  return { repo, file, token, ...(apiBase ? { apiBase } : {}) };
}

// ── base64 (큰 파일도 되도록 나눠서 변환) ──
export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) {
  const s = atob(String(b64).replace(/\s/g, ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function request(cfg, method, path, body = null, raw = false, fetchFn = globalThis.fetch) {
  let res;
  try {
    res = await fetchFn(`${cfg.apiBase || "https://api.github.com"}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new CloudError("인터넷에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도하세요.");
  }
  if (res.status === 404) return null;
  if (res.status === 401) throw new CloudError("접속 토큰이 올바르지 않거나 만료되었습니다. GitHub 에서 토큰을 확인하세요.");
  if (res.status === 403) throw new CloudError("이 토큰으로는 저장소에 접근할 수 없습니다. 토큰 권한(Contents 읽기·쓰기)을 확인하세요.");
  if (res.status === 409 || res.status === 422) throw new CloudError("다른 기기가 방금 장부를 올렸습니다. [받아오기]로 먼저 확인하세요.");
  if (!res.ok) throw new CloudError(`GitHub 응답 오류 (${res.status}). 잠시 뒤 다시 시도하세요.`);
  return raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
}

/** 저장소가 있고, 비공개이고, 쓸 수 있는지 확인 */
export async function checkRepo(cfg, fetchFn) {
  const info = await request(cfg, "GET", `/repos/${cfg.repo}`, null, false, fetchFn);
  if (!info) throw new CloudError(`저장소 '${cfg.repo}' 를 찾을 수 없습니다. 이름과 토큰의 저장소 선택을 확인하세요.`);
  if (!info.private) throw new CloudError("공개 저장소입니다. 장부는 비공개(Private) 저장소에만 올릴 수 있습니다.");
  if (info.permissions && !info.permissions.push) {
    throw new CloudError("이 토큰에는 저장소 쓰기 권한이 없습니다. 토큰 권한에서 Contents 를 'Read and write' 로 설정하세요.");
  }
  return info;
}

/** 저장소의 잠긴 장부 { sha, data, meta } 또는 null */
export async function fetchRemote(cfg, fetchFn) {
  const path = `/repos/${cfg.repo}/contents/${cfg.file}`;
  const item = await request(cfg, "GET", path, null, false, fetchFn);
  if (!item) return null;
  const data = item.content ? fromBase64(item.content) : await request(cfg, "GET", path, null, true, fetchFn); // 1MB 초과 시
  return { sha: item.sha, data, meta: readMeta(data) };
}

const when = (m) => (m?.last_modified ? `${m.last_device || "기기 모름"}, ${m.last_modified.slice(0, 16)} 수정` : "수정 시각 정보 없음");

/** 지금 장부를 잠가서 올린다. 저장소에 더 최신 장부가 있으면 force 없이는 RemoteIsNewer */
export async function push(db, cfg, password, { force = false, fetchFn } = {}) {
  await checkRepo(cfg, fetchFn);
  const s = getSettings(db);
  const current = { last_modified: s.last_modified, last_device: s.last_device };
  const remote = await fetchRemote(cfg, fetchFn);
  if (remote && !force && compareFreshness(remote.meta, current).level === "newer") {
    throw new RemoteIsNewer(`저장소에 지금 장부보다 최신 장부(${when(remote.meta)})가 있습니다. 올리면 그 장부를 덮어씁니다. 먼저 [받아오기]로 확인하세요.`, remote.meta);
  }
  const locked = await lock(db.export(), password, s);
  const body = { message: `장부 올리기: ${s.last_device || "휴대폰"} ${s.last_modified.slice(0, 16)} 수정`, content: toBase64(locked) };
  if (remote) body.sha = remote.sha;
  const res = await request(cfg, "PUT", `/repos/${cfg.repo}/contents/${cfg.file}`, body, false, fetchFn);
  return { sha: res.content.sha, meta: readMeta(locked), replaced: !!remote };
}

/** 저장소의 잠긴 장부를 받아 풀어서 SQLite 파일 내용으로. 없으면 null */
export async function pull(cfg, password, { fetchFn } = {}) {
  await checkRepo(cfg, fetchFn);
  const remote = await fetchRemote(cfg, fetchFn);
  return remote ? unlock(remote.data, password) : null;
}
