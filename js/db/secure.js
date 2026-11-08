// 비밀번호로 잠근 백업 파일 (.fmbk) — PC data/secure_backup.py 와 같은 형식.
// 외부 저장소(GitHub 비공개 저장소)에는 이 형식만 올린다. 비밀번호를 모르면 내용을 볼 수 없다.
//
// 형식 (FMBK v1, 숫자는 big-endian):
//   "FMBK"(4) | 버전 1(1) | 정보 길이 L(2) | 정보 JSON(L) | PBKDF2 반복 횟수(4) | salt(16) | nonce(12) | 암호문+GCM 태그
// - 정보 JSON(개인정보 없음): schema_version, last_modified, last_device, created_at → 비밀번호 없이 최신 여부 비교
// - 키: PBKDF2-HMAC-SHA256 → AES-256-GCM, AAD = 암호문 앞부분 전체. 평문 = gzip(SQLite 파일)
import { nowStamp } from "./repo.js";

export const ITERATIONS = 600_000;
export const MIN_PASSWORD = 8;
const MAGIC = [0x46, 0x4d, 0x42, 0x4b]; // "FMBK"
const VERSION = 1;
const MAX_ITERATIONS = 5_000_000;

export class SecureBackupError extends Error {}

export function checkPassword(password) {
  if ((password ?? "").length < MIN_PASSWORD) throw new SecureBackupError(`백업 비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
}

export const isLocked = (bytes) => MAGIC.every((b, i) => bytes[i] === b);

function parse(bytes) {
  if (bytes.length < 7 || !isLocked(bytes)) throw new SecureBackupError("비밀번호로 잠근 Futsal Manager 백업 파일(.fmbk)이 아닙니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(4) !== VERSION) throw new SecureBackupError("더 새로운 버전의 앱에서 만든 백업입니다. 앱을 새로고침해 최신 버전으로 업데이트하세요.");
  const metaLen = view.getUint16(5);
  const head = 7 + metaLen;
  if (bytes.length < head + 32 + 16) throw new SecureBackupError("백업 파일이 손상되었습니다.");
  let meta;
  try {
    meta = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(7, head)));
  } catch {
    throw new SecureBackupError("백업 파일이 손상되었습니다.");
  }
  const iterations = view.getUint32(head);
  if (iterations < 1 || iterations > MAX_ITERATIONS) throw new SecureBackupError("백업 파일이 손상되었습니다.");
  const aadEnd = head + 32;
  return { meta, iterations, salt: bytes.slice(head + 4, head + 20), nonce: bytes.slice(head + 20, aadEnd),
    header: bytes.slice(0, aadEnd), ciphertext: bytes.slice(aadEnd) };
}

/** 비밀번호 없이 정보(마지막 수정 시각·기기·구조 버전)만 읽기 */
export const readMeta = (bytes) => parse(bytes).meta;

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** SQLite 장부 파일 내용을 비밀번호로 잠근다. meta: { schema_version, last_modified, last_device } */
export async function lock(dbBytes, password, meta, iterations = ITERATIONS) {
  checkPassword(password);
  const info = { schema_version: Number(meta.schema_version || 0), last_modified: meta.last_modified ?? "",
    last_device: meta.last_device ?? "", created_at: nowStamp() };
  const metaBytes = new TextEncoder().encode(JSON.stringify(info));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(7 + metaBytes.length + 32);
  const view = new DataView(header.buffer);
  header.set(MAGIC, 0);
  view.setUint8(4, VERSION);
  view.setUint16(5, metaBytes.length);
  header.set(metaBytes, 7);
  view.setUint32(7 + metaBytes.length, iterations);
  header.set(salt, 11 + metaBytes.length);
  header.set(nonce, 27 + metaBytes.length);
  const key = await deriveKey(password, salt, iterations);
  const zipped = await pipe(dbBytes, new CompressionStream("gzip"));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: header }, key, zipped));
  const out = new Uint8Array(header.length + ciphertext.length);
  out.set(header, 0);
  out.set(ciphertext, header.length);
  return out;
}

/** 잠긴 백업을 풀어 SQLite 장부 파일 내용을 돌려준다 */
export async function unlock(bytes, password) {
  const p = parse(bytes);
  let plain;
  try {
    const key = await deriveKey(password ?? "", p.salt, p.iterations);
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: p.nonce, additionalData: p.header }, key, p.ciphertext);
  } catch {
    throw new SecureBackupError("비밀번호가 틀렸거나 백업 파일이 손상되었습니다.");
  }
  try {
    return await pipe(new Uint8Array(plain), new DecompressionStream("gzip"));
  } catch {
    throw new SecureBackupError("백업 파일이 손상되었습니다.");
  }
}
