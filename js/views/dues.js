// 회비: 월별 회원 카드 + [납부 완료] 한 번에, 눌러서 상태·금액·입금일 고치기, 선납 등록
// 저장 규칙은 PC 와 같다(write.setDues): '납부 완료'가 되면 모임통장에 회비 입금이 자동으로 생긴다.
import { DUE_STATUSES, currentMonth, firstDataMonth, getMonthDues, getSettings, isPrepaid, listMembers, shiftMonth, summarizeDues } from "../db/repo.js";
import { MAX_PREPAY_MONTHS, planPrepayment, recordPrepayment, setDues } from "../db/write.js";
import { esc, persist, setHeader, state, toast } from "../state.js";
import { monthLabel, monthNav, openSheet, segmented, shortDate, today, won } from "../ui.js";

const FILTERS = ["전체", "미납", "확인 중", "납부 완료", "면제"];
const PAID = ["납부 완료", "확인 중"];
const view = { month: currentMonth(), filter: "전체" };

const range = () => ({ min: [firstDataMonth(state.db) ?? currentMonth(), currentMonth()].sort()[0], max: shiftMonth(currentMonth(), 1) });

/** 입금일 기본값: 이번 달이면 오늘, 아니면 그 달 1일 (PC 표는 1일) */
const defaultPaidDate = (ym) => (today().startsWith(ym) ? today() : `${ym}-01`);

function bankNote(synced) {
  const parts = [["created", "입금 등록"], ["updated", "입금 수정"], ["deleted", "입금 삭제"]].filter(([k]) => synced[k]).map(([k, l]) => `${l} ${synced[k]}건`);
  return parts.length ? ` · 모임통장 ${parts.join(", ")}` : "";
}

export function renderDues(app) {
  const s = getSettings(state.db);
  const { min, max } = range();
  view.month = view.month < min ? min : view.month > max ? max : view.month;
  const dues = getMonthDues(state.db, view.month);
  const sum = summarizeDues(dues);
  const shown = view.filter === "전체" ? dues : dues.filter((d) => d.status === view.filter);
  setHeader(s.team_name || "Futsal Manager", "회비", `${monthLabel(view.month)} · 월 회비 ${won(s.monthly_fee)}원`);

  const card = (d) => {
    const paid = PAID.includes(d.status);
    const detail = paid ? `${won(d.amount)}원 · ${shortDate(d.paid_date)}${isPrepaid(d) ? " · 선납" : ""}` : "";
    return `<li class="due-card" data-action="due-edit" data-id="${d.member_id}">
        <div class="who">${d.back_number ? `<span class="num">${d.back_number}</span>` : ""}<b>${esc(d.member_name)}</b>
          ${d.member_status === "휴면" ? `<span class="muted small">휴면</span>` : ""}</div>
        <div class="meta"><span class="badge s-${DUE_STATUSES.indexOf(d.status)}">${esc(d.status)}</span><span class="muted small">${detail}</span></div>
        ${d.status === "납부 완료" || d.status === "면제" ? "" : `<button class="btn primary small" data-action="due-paid" data-id="${d.member_id}">납부 완료</button>`}
      </li>`;
  };

  app.innerHTML = `
    ${monthNav(view.month, min, max)}
    <div class="cards">
      <div class="card"><div class="label">납부율</div><div class="value">${sum.rate.toFixed(1)}%</div>
        <div class="note">${sum.counts["납부 완료"]} / ${sum.total}명</div></div>
      <div class="card"><div class="label">회비 수입</div><div class="value">${won(sum.collected)}원</div>
        <div class="note">미납 ${sum.counts["미납"]} · 확인 중 ${sum.counts["확인 중"]} · 면제 ${sum.counts["면제"]}</div></div>
    </div>
    <div class="chips" role="tablist">${FILTERS.map((f) => `<button class="chip" data-action="due-filter" data-filter="${f}" aria-pressed="${f === view.filter}">${f}${f === "전체" ? "" : ` ${sum.counts[f]}`}</button>`).join("")}</div>
    ${dues.length === 0 ? `<p class="muted">이 달의 회비 대상 회원이 없습니다.</p>`
      : shown.length === 0 ? `<p class="muted">'${esc(view.filter)}' 상태인 회원이 없습니다.</p>`
      : `<ul class="list due-list">${shown.map(card).join("")}</ul>`}
    <button class="btn" data-action="prepay">선납·연납 등록 (여러 달 한 번에)</button>
    <p class="muted small">대상: 그 달 말일까지 가입한 활동 회원 + 그 달 기록이 있는 회원. '납부 완료'로 바꾸면 모임통장에 회비 입금이 자동으로 등록됩니다.</p>`;
}

async function save(changes, message) {
  const synced = setDues(state.db, changes);
  await persist();
  toast(message + bankNote(synced));
}

async function quickPaid(memberId) {
  const d = getMonthDues(state.db, view.month).find((x) => x.member_id === memberId);
  const fee = getSettings(state.db).monthly_fee;
  await save([{ member_id: memberId, year_month: view.month, status: "납부 완료", amount: d.amount || fee,
    paid_date: d.paid_date || defaultPaidDate(view.month), label: d.member_name }], `${d.member_name} ${Number(view.month.slice(5))}월 회비 납부 완료`);
}

async function editDue(memberId) {
  const d = getMonthDues(state.db, view.month).find((x) => x.member_id === memberId);
  const fee = getSettings(state.db).monthly_fee;
  const res = await openSheet({
    title: `${d.member_name} · ${monthLabel(view.month)}`,
    body: `
      <div class="field">납부 상태${segmented("status", DUE_STATUSES, d.status)}</div>
      <div class="paid-only">
        <label class="field">납부 금액 (원)<input name="amount" type="number" inputmode="numeric" min="0" step="1000" value="${d.amount || fee}"></label>
        <label class="field">입금일<input name="paid_date" type="date" value="${d.paid_date || defaultPaidDate(view.month)}"></label>
      </div>
      <p class="muted small">'납부 완료'는 모임통장에 회비 입금(내용: 회원 이름)을 자동으로 등록·수정하고, '미납'·'면제'로 바꾸면 그 입금을 지웁니다.</p>`,
    onInput: (form) => {
      form.querySelector(".paid-only").hidden = !PAID.includes(form.status.value);
    },
    onSubmit: (f) => {
      setDues(state.db, [{ member_id: memberId, year_month: view.month, status: f.status, amount: Number(f.amount), paid_date: f.paid_date, label: d.member_name }]);
    },
  });
  if (res) {
    await persist();
    toast(`${d.member_name} ${Number(view.month.slice(5))}월: ${res.data.status}`);
  }
}

async function prepay() {
  const members = listMembers(state.db, { status: "활동" });
  if (!members.length) return toast("활동 회원이 없습니다.", "warn");
  const s = getSettings(state.db);
  const months = Array.from({ length: 14 }, (_, i) => shiftMonth(currentMonth(), i - 1));
  const res = await openSheet({
    title: "선납·연납 등록",
    submitLabel: "선납 등록",
    body: `
      <label class="field">회원<select name="member">${members.map((m) => `<option value="${m.id}">${m.back_number ? `${m.back_number} ` : ""}${esc(m.name)}</option>`).join("")}</select></label>
      <div class="row2">
        <label class="field">시작 월<select name="start">${months.map((m) => `<option value="${m}" ${m === currentMonth() ? "selected" : ""}>${monthLabel(m)}</option>`).join("")}</select></label>
        <label class="field">개월 수<input name="months" type="number" inputmode="numeric" min="1" max="${MAX_PREPAY_MONTHS}" value="6"></label>
      </div>
      <div class="row2">
        <label class="field">월 회비 (원)<input name="amount" type="number" inputmode="numeric" min="1000" step="1000" value="${s.monthly_fee}"></label>
        <label class="field">입금일<input name="paid_date" type="date" value="${today()}"></label>
      </div>
      <label class="check"><input type="checkbox" name="deposit" checked> 모임통장에 입금 거래도 함께 등록 (분류 '회비')</label>
      <p class="summary" id="prepay-plan"></p>`,
    onInput: (form) => {
      const n = Number(form.months.value);
      const box = form.querySelector("#prepay-plan");
      if (!(n >= 1 && n <= MAX_PREPAY_MONTHS)) return (box.textContent = `개월 수는 1~${MAX_PREPAY_MONTHS}개월입니다.`);
      const plan = planPrepayment(state.db, Number(form.member.value), form.start.value, n);
      const total = Number(form.amount.value || 0) * plan.months.length;
      box.innerHTML = `<b>${plan.months.length}개월 · ${won(total)}원</b><br>${plan.months.map(monthLabel).join(", ")}` +
        (plan.skipped.length ? `<br><span class="muted small">이미 정리된 달은 건너뜀: ${plan.skipped.map(([ym, st]) => `${monthLabel(ym)}(${st})`).join(", ")}</span>` : "");
    },
    onSubmit: (f) => recordPrepayment(state.db, Number(f.member), f.start, Number(f.months), Number(f.amount), f.paid_date, f.deposit),
  });
  if (res) {
    await persist();
    const r = res.result;
    toast(`${r.name} ${r.months.length}개월 선납 (${won(r.total)}원)${r.tx_id ? " · 모임통장 입금 등록" : ""}`);
  }
}

/** 이 화면의 버튼 처리. 처리했으면 true (다시 그림) */
export async function onDuesAction(action, el) {
  const { min, max } = range();
  if (action === "month-prev" && view.month > min) view.month = shiftMonth(view.month, -1);
  else if (action === "month-next" && view.month < max) view.month = shiftMonth(view.month, 1);
  else if (action === "due-filter") view.filter = el.dataset.filter;
  else if (action === "due-paid") await quickPaid(Number(el.dataset.id));
  else if (action === "due-edit") await editDue(Number(el.dataset.id));
  else if (action === "prepay") await prepay();
  else return false;
  return true;
}
