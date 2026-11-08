// 앱 전체가 함께 쓰는 상태: sql.js, 지금 열린 장부, 화면 도우미
import { saveLedger } from "./db/storage.js";

export const state = {
  SQL: null, // initSqlJs 결과
  db: null,  // 지금 열린 장부 (sql.js Database)
  meta: {},  // IndexedDB 의 앱 정보 (lastBackupAt 등)
};

/** 장부를 고친 뒤 반드시 호출: 파일 전체를 휴대폰 저장소에 저장 */
export async function persist() {
  await saveLedger(state.db.export());
}

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const krw = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
export const signed = (n) => `${n > 0 ? "+" : ""}${Number(n).toLocaleString("ko-KR")}원`;

export function setHeader(eyebrow, title, sub = "") {
  $("team-name").textContent = eyebrow;
  $("page-title").textContent = title;
  $("page-sub").textContent = sub;
}

/** 화면 위쪽에 잠깐 뜨는 알림 */
export function toast(message, kind = "ok") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = "toast"), kind === "ok" ? 3500 : 6000);
}

export function errorBox(message) {
  return `<p class="error" role="alert">${esc(message)}</p>`;
}

/** 'YYYY-MM-DD HH:MM' 표시 (ISO 또는 장부 시각 문자열) */
export function showTime(value) {
  if (!value) return "-";
  if (value.includes("T")) {
    const d = new Date(value);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return value.slice(0, 16);
}
