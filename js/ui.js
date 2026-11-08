// 화면 공통 부품: 아래에서 올라오는 입력 창(시트), 월 이동, 날짜·금액 표시
import { $, esc } from "./state.js";

const pad = (n) => String(n).padStart(2, "0");
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const shortDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}` : "");
export const monthLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
export const won = (n) => Number(n || 0).toLocaleString("ko-KR");

/** 연락처 가운데 자리 가리기 (휴대폰 화면을 남이 볼 수 있으므로 목록에서는 가림) */
export const maskPhone = (p) => (p ? String(p).replace(/^(\d{3})-(\d{3,4})-(\d{4})$/, "$1-****-$3") : "");

/** 월 이동 막대: ◀ 2026년 11월 ▶ */
export function monthNav(ym, min, max) {
  return `<div class="month-nav">
      <button class="icon-btn" data-action="month-prev" aria-label="이전 달" ${ym <= min ? "disabled" : ""}>‹</button>
      <b>${monthLabel(ym)}</b>
      <button class="icon-btn" data-action="month-next" aria-label="다음 달" ${ym >= max ? "disabled" : ""}>›</button>
    </div>`;
}

/** 선택지 단추 묶음 (라디오) */
export function segmented(name, options, value) {
  return `<div class="segmented" role="radiogroup">${options.map((o) => {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    return `<label><input type="radio" name="${name}" value="${esc(v)}" ${v === value ? "checked" : ""}><span>${esc(label)}</span></label>`;
  }).join("")}</div>`;
}

/**
 * 아래에서 올라오는 입력 창. 저장하면 { action: "save", data: {필드: 값} }, 삭제는 { action: "delete" }, 닫으면 null.
 * onInput(form) 은 입력할 때마다 불려 미리보기 등을 고칠 수 있다.
 * onSubmit(data) 가 오류를 던지면 창을 닫지 않고 그 안에 오류를 보여 준다.
 */
export function openSheet({ title, body, submitLabel = "저장", deletable = false, deleteLabel = "삭제", onInput, onSubmit }) {
  const dialog = $("sheet");
  dialog.innerHTML = `
    <form method="dialog" class="sheet" novalidate>
      <div class="sheet-head"><h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="닫기">✕</button></div>
      <div class="sheet-body">${body}</div>
      <p class="error" role="alert" hidden></p>
      <div class="actions ${deletable ? "three" : ""}">
        ${deletable ? `<button type="button" class="btn danger" data-delete>${esc(deleteLabel)}</button>` : ""}
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  const form = dialog.querySelector("form");
  const err = form.querySelector(".error");
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      dialog.close();
      resolve(value);
    };
    form.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => finish(null)));
    form.querySelector("[data-delete]")?.addEventListener("click", () => finish({ action: "delete" }));
    if (onInput) {
      form.addEventListener("input", () => onInput(form));
      onInput(form);
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      form.querySelectorAll("input[type=checkbox]").forEach((c) => (data[c.name] = c.checked));
      try {
        const result = onSubmit ? await onSubmit(data) : data;
        finish({ action: "save", data, result });
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });
    dialog.oncancel = () => finish(null); // 뒤로 가기·Esc
    dialog.showModal();
  });
}
