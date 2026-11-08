// 모임통장: 월별 장부(전월 이월·수입·지출·잔액), 거래 목록, 눌러서 수정·삭제, [거래 등록]
import { TX_CATEGORIES, TX_TYPES, categorySummary, currentMonth, getSettings, getTransaction, linkedDueCount, monthLedger, shiftMonth, transactionMonths } from "../db/repo.js";
import { addTransaction, deleteTransaction, updateTransaction } from "../db/write.js";
import { esc, persist, setHeader, state, toast } from "../state.js";
import { monthLabel, monthNav, openSheet, segmented, shortDate, today, won } from "../ui.js";
import { openShare } from "./share.js";

const view = { month: currentMonth() };

function range() {
  const months = transactionMonths(state.db);
  return { min: [months.at(-1) ?? currentMonth(), currentMonth()].sort()[0], max: [months[0] ?? currentMonth(), currentMonth()].sort().at(-1) };
}

export function renderBank(app) {
  const s = getSettings(state.db);
  const { min, max } = range();
  view.month = view.month < min ? min : view.month > max ? max : view.month;
  const L = monthLedger(state.db, view.month);
  setHeader(s.team_name || "Futsal Manager", "모임통장", `${monthLabel(view.month)} 장부`);

  const rows = [...L.rows].reverse(); // 최신 거래가 위로
  const cats = categorySummary(L.rows);
  app.innerHTML = `
    ${monthNav(view.month, min, max)}
    <section class="card wide ledger">
      <div class="ledger-row"><span>전월 이월</span><b>${won(L.opening)}원</b></div>
      <div class="ledger-row pos"><span>수입</span><b>+${won(L.income)}원</b></div>
      <div class="ledger-row neg"><span>지출</span><b>−${won(L.expense)}원</b></div>
      <div class="ledger-row total"><span>${Number(view.month.slice(5))}월 말 잔액</span><b>${won(L.closing)}원</b></div>
      ${cats.length ? `<div class="cat-chips">${cats.map((c) => `<span class="chip static">${esc(c.category)} ${c.net >= 0 ? "+" : "−"}${won(Math.abs(c.net))}</span>`).join("")}</div>` : ""}
    </section>
    <div class="actions"><button class="btn primary" data-action="tx-add">＋ 거래 등록</button>
      <button class="btn" data-action="share">📤 회비운영현황 공유</button></div>
    ${rows.length ? `<ul class="list tx-list">${rows.map((t) => `
      <li data-action="tx-edit" data-id="${t.id}">
        <div class="tx-date">${shortDate(t.date)}</div>
        <div class="tx-main"><b>${esc(t.description)}</b>
          <span class="muted small">${esc(t.category)}${t.memo ? ` · ${esc(t.memo)}` : ""}${t.ledger_month ? ` · ${Number(t.ledger_month.slice(5))}월 장부` : ""}</span></div>
        <div class="tx-amt"><b class="${t.deposit ? "pos" : "neg"}">${t.deposit ? `+${won(t.deposit)}` : `−${won(t.withdrawal)}`}</b>
          <span class="muted small">${won(t.balance)}</span></div>
      </li>`).join("")}</ul>` : `<p class="muted">이 달 장부에 거래가 없습니다.</p>`}`;
}

function txForm(t = null) {
  const type = t ? t.type : "지출";
  return `
    <div class="field">구분${segmented("type", TX_TYPES, type)}</div>
    <div class="row2">
      <label class="field">거래일<input name="date" type="date" value="${t?.date ?? (today().startsWith(view.month) ? today() : `${view.month}-01`)}"></label>
      <label class="field">금액 (원)<input name="amount" type="number" inputmode="numeric" min="1" step="100" value="${t ? t.deposit || t.withdrawal : ""}" placeholder="0"></label>
    </div>
    <label class="field">분류<select name="category">${TX_CATEGORIES.map((c) => `<option ${c === (t?.category ?? "구장 예약") ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    <label class="field">내용<input name="description" value="${esc(t?.description ?? "")}" placeholder="예: 구장 예약, 음료수, 홍길동"></label>
    <label class="field">비고 (선택)<input name="memo" value="${esc(t?.memo ?? "")}"></label>
    <details class="help"><summary>장부 월 바꾸기 (선택)</summary>
      <p>예: 8월 31일에 받은 9월 회비를 9월 장부에 넣을 때. 비우면 거래일의 달.</p>
      <label class="field">장부 월<input name="ledger_month" type="month" value="${t?.ledger_month ?? ""}"></label>
    </details>`;
}

const fromForm = (f) => ({ date: f.date, description: f.description, type: f.type, amount: Number(f.amount), category: f.category, memo: f.memo, ledger_month: f.ledger_month || null });

async function addTx() {
  const res = await openSheet({ title: "거래 등록", submitLabel: "등록", body: txForm(), onSubmit: (f) => addTransaction(state.db, fromForm(f)) });
  if (res) {
    await persist();
    const ym = (res.data.ledger_month || res.data.date).slice(0, 7);
    view.month = ym; // 등록한 거래가 보이는 달로
    toast(`등록했습니다: ${res.data.description} ${res.data.type} ${won(res.data.amount)}원`);
  }
}

async function editTx(id) {
  const t = getTransaction(state.db, id);
  const linked = linkedDueCount(state.db, id);
  const res = await openSheet({
    title: "거래 수정",
    deletable: true,
    body: (linked ? `<p class="notice warn">회비 납부 기록 ${linked}건과 연결된 회비 입금입니다. 금액·날짜는 <b>회비</b> 화면에서 고치는 것이 좋습니다. 여기서 지우면 납부 기록은 그대로 남습니다.</p>` : "") + txForm(t),
    onSubmit: (f) => updateTransaction(state.db, id, fromForm(f)),
  });
  if (!res) return;
  if (res.action === "delete") {
    if (!confirm(`'${t.description}' ${won(t.deposit || t.withdrawal)}원 거래를 삭제할까요?`)) return;
    deleteTransaction(state.db, id);
    toast("거래를 삭제했습니다.", "warn");
  } else {
    toast("거래를 수정했습니다.");
  }
  await persist();
}

export async function onBankAction(action, el) {
  const { min, max } = range();
  if (action === "month-prev" && view.month > min) view.month = shiftMonth(view.month, -1);
  else if (action === "month-next" && view.month < max) view.month = shiftMonth(view.month, 1);
  else if (action === "tx-add") await addTx();
  else if (action === "share") await openShare(view.month);
  else if (action === "tx-edit") await editTx(Number(el.dataset.id));
  else return false;
  return true;
}
