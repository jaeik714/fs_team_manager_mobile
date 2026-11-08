// 시작점 (시험판): sql.js 로드 → 휴대폰에 저장된 장부 열기 → 대시보드.
// 장부가 없으면 PC 백업 파일(.db)을 불러오는 첫 화면을 보여 준다.
import { clearLedger, loadLedger, requestPersist, saveLedger, saveSafetyCopy } from "./db/storage.js";
import { LedgerError, NEEDS_EXTRA_CONFIRM, compareFreshness, dashboard, ledgerInfo, openLedger } from "./db/repo.js";

const $ = (id) => document.getElementById(id);
const app = $("app");
let SQL = null;
let db = null; // 지금 열려 있는 장부 (sql.js Database)

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const krw = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const signed = (n) => `${n > 0 ? "+" : ""}${Number(n).toLocaleString("ko-KR")}원`;

function setHeader(eyebrow, title, sub = "") {
  $("team-name").textContent = eyebrow;
  $("page-title").textContent = title;
  $("page-sub").textContent = sub;
}

function showError(message) {
  app.insertAdjacentHTML("afterbegin", `<p class="error" role="alert">${esc(message)}</p>`);
}

// ── 첫 화면: 장부 없음 ──
function renderWelcome() {
  setHeader("Futsal Manager", "장부 불러오기", "휴대폰 시험판");
  app.innerHTML = `
    <section class="hero">
      <h2>PC 장부 파일을 불러와 주세요</h2>
      <ol>
        <li>PC 프로그램(v1.8.0 이상) › 백업·복원 › <b>백업 파일 내려받기</b></li>
        <li>내려받은 <b>.db</b> 파일을 카카오톡 '나와의 채팅' 등으로 휴대폰에 보내기</li>
        <li>아래 버튼을 눌러 그 파일 선택</li>
      </ol>
      <button class="btn primary" data-action="import">장부 파일 불러오기</button>
      <p class="muted">장부는 이 휴대폰 안에만 저장됩니다. 인터넷으로 보내지 않습니다.</p>
    </section>`;
}

// ── 대시보드 ──
function renderDashboard() {
  const d = dashboard(db);
  const [, mm] = d.month.split("-");
  const month = Number(mm);
  const due = d.dues;
  setHeader(d.settings.team_name || "Futsal Manager", `MATCHDAY · ${month}월`, `납부 기한 ${month}월 ${d.settings.fee_due_day}일`);

  const unpaid = d.unpaid.length
    ? `<ul class="list">${d.unpaid.map((u) => `
        <li><span>${u.back_number ? `<b>${u.back_number}</b> ` : ""}${esc(u.member_name)}</span>
            <span class="badge ${u.status === "확인 중" ? "pending" : "unpaid"}">${esc(u.status)}</span></li>`).join("")}</ul>`
    : `<p class="muted">모두 납부했습니다. 👏</p>`;

  const s = d.settings;
  app.innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">회원</div><div class="value">${d.members}명</div>
        <div class="note">활동 ${d.active} · 휴면 ${d.members - d.active}</div></div>
      <div class="card"><div class="label">${month}월 납부율</div><div class="value">${due.rate.toFixed(1)}%</div>
        <div class="note">${due.counts["납부 완료"]} / ${due.total}명${due.counts["면제"] ? ` · 면제 ${due.counts["면제"]}` : ""}</div></div>
      <div class="card"><div class="label">${month}월 회비 수입</div><div class="value">${krw(due.collected)}</div>
        <div class="note">${due.pending_amount ? `확인 중 ${krw(due.pending_amount)}` : "확인 중 없음"}</div></div>
      <div class="card"><div class="label">통장 잔액</div><div class="value">${krw(d.balance)}</div>
        <div class="note ${d.monthNet >= 0 ? "pos" : "neg"}">${month}월 ${signed(d.monthNet)}</div></div>
    </div>
    <h2 class="section-title">미납·확인 중 ${d.unpaid.length}명</h2>
    ${unpaid}
    <p class="muted">장부 마지막 수정: ${esc(s.last_modified.slice(0, 16) || "-")} (${esc(s.last_device || "기기 모름")})</p>
    <button class="btn" data-action="import">다른 장부 파일 불러오기</button>
    <button class="btn" data-action="clear">이 휴대폰에서 장부 지우기 (시험용)</button>`;
}

// ── 불러오기 ──
function askImport(info, current) {
  const dialog = $("import-dialog");
  $("import-summary").innerHTML =
    `팀 <b>${esc(info.team_name || "-")}</b> · 회원 ${info.members}명 · 회비 기록 ${info.dues}건 · 거래 ${info.transactions}건<br>` +
    `마지막 거래일 ${esc(info.last_tx_date || "-")} · 마지막 수정 ${esc(info.last_modified.slice(0, 16) || "-")} (${esc(info.last_device || "기기 모름")})`;

  const fresh = current ? compareFreshness(info, current) : null;
  const needExtra = !!fresh && NEEDS_EXTRA_CONFIRM.includes(fresh.level);
  const notice = $("import-freshness");
  notice.textContent = fresh ? fresh.message : "";
  notice.classList.toggle("warn", needExtra);
  $("confirm-2-row").hidden = !needExtra;
  $("confirm-1").checked = false;
  $("confirm-2").checked = false;

  const ok = $("import-ok");
  const update = () => { ok.disabled = !($("confirm-1").checked && (!needExtra || $("confirm-2").checked)); };
  $("confirm-1").onchange = $("confirm-2").onchange = update;
  update();

  return new Promise((resolve) => {
    dialog.onclose = () => resolve(dialog.returnValue === "ok");
    dialog.returnValue = "";
    dialog.showModal();
  });
}

async function importFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let incoming;
  try {
    incoming = openLedger(SQL, bytes);
  } catch (e) {
    showError(e instanceof LedgerError ? e.message : `파일을 열 수 없습니다. (${e.message})`);
    return;
  }
  const info = ledgerInfo(incoming);
  const current = db ? ledgerInfo(db) : null;
  if (!(await askImport(info, current))) {
    incoming.close();
    return;
  }
  if (db) await saveSafetyCopy(db.export());
  await saveLedger(incoming.export()); // 수정 시각은 파일에 적힌 그대로 유지 (불러오기는 '수정'이 아님)
  db?.close();
  db = incoming;
  renderDashboard();
}

async function clearAll() {
  if (!confirm("이 휴대폰에 저장된 장부를 지웁니다. PC 에 백업이 있는지 확인하셨나요?")) return;
  await clearLedger();
  db?.close();
  db = null;
  renderWelcome();
}

// ── 이벤트 ──
app.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "import") $("file-input").click();
  if (action === "clear") clearAll();
});
$("file-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ""; // 같은 파일을 다시 골라도 change 가 일어나게
  if (file) await importFile(file);
});

// ── 시작 ──
async function start() {
  try {
    SQL = await initSqlJs({ locateFile: (f) => `vendor/sql.js/${f}` });
  } catch (e) {
    setHeader("Futsal Manager", "시작할 수 없습니다");
    app.innerHTML = "";
    showError(`SQLite 를 불러오지 못했습니다. (${e.message})`);
    return;
  }
  requestPersist();
  const saved = await loadLedger();
  if (saved) {
    try {
      db = openLedger(SQL, saved.bytes);
    } catch (e) {
      renderWelcome();
      showError(`저장된 장부를 열 수 없습니다: ${e.message}`);
      return;
    }
    renderDashboard();
  } else {
    renderWelcome();
  }
}
start();
