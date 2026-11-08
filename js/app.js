// 시작점: sql.js 로드 → 휴대폰에 저장된 장부 열기 → 화면(홈·백업) 전환.
// 장부가 없으면 PC 백업 파일(.db)을 불러오는 첫 화면을 보여 준다.
import { backupFileName, sendBackup } from "./db/backup.js";
import { CloudError, RemoteIsNewer, checkRepo, makeConfig, pull, push } from "./db/cloud.js";
import { SecureBackupError, checkPassword } from "./db/secure.js";
import { LedgerError, NEEDS_EXTRA_CONFIRM, compareFreshness, getSettings, ledgerInfo, openLedger } from "./db/repo.js";
import { clearLedger, getMeta, loadLedger, loadSafetyCopy, requestPersist, saveLedger, saveSafetyCopy, setMeta } from "./db/storage.js";
import { $, errorBox, esc, setHeader, showTime, state, toast } from "./state.js";
import { applyTheme } from "./theme.js";
import { renderBackup } from "./views/backup.js";
import { onBankAction, renderBank } from "./views/bank.js";
import { onDuesAction, renderDues } from "./views/dues.js";
import { renderHome } from "./views/home.js";
import { onMembersAction, renderMembers } from "./views/members.js";
import { saveSettingsForm } from "./views/settings.js";

const app = $("app");
// 화면: 그리기 함수와 그 화면의 버튼 처리 (backup 은 안전 백업 정보가 필요해 따로 그림)
const TABS = { home: [renderHome], dues: [renderDues, onDuesAction], bank: [renderBank, onBankAction],
  members: [renderMembers, onMembersAction], backup: [null] };
let tab = "home";

// ── 화면 전환 ──
async function show(name = tab) {
  tab = TABS[name] !== undefined ? name : "home";
  $("tabbar").hidden = !state.db;
  if (!state.db) return renderWelcome();
  document.querySelectorAll("#tabbar [data-tab]").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  applyTheme(getSettings(state.db).team_color);
  if (tab === "backup") {
    const safety = await loadSafetyCopy();
    renderBackup(app, { hasSafety: !!safety, safetyAt: safety?.savedAt });
  } else {
    TABS[tab][0](app);
  }
  if (name !== show.last) window.scrollTo(0, 0); // 같은 화면을 다시 그릴 때는 스크롤 유지
  show.last = name;
}

function renderWelcome() {
  setHeader("Futsal Manager", "장부 불러오기", "휴대폰 버전");
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

// ── 백업 보내기: GitHub 연결이 있으면 올리기, 없으면 파일로 ──
async function onSendBackup(button) {
  return state.meta.cloud ? cloudPush(button) : onSendFile();
}

async function busy(button, fn) {
  button?.setAttribute("aria-busy", "true");
  try {
    return await fn();
  } finally {
    button?.removeAttribute("aria-busy");
  }
}

function cloudPassword() {
  const pw = state.meta.cloud?.password || $("cloud-pw")?.value || "";
  if (!pw) throw new CloudError("백업 비밀번호를 입력하세요.");
  return pw;
}

async function cloudPush(button, force = false) {
  try {
    const res = await busy(button, () => push(state.db, state.meta.cloud, cloudPassword(), { force }));
    state.meta = await setMeta({ lastBackupAt: new Date().toISOString(), lastBackupMethod: "cloud" });
    toast(`GitHub 에 올렸습니다. (${res.meta.last_device} ${showTime(res.meta.last_modified)} 수정 장부)`);
    await show();
  } catch (e) {
    if (e instanceof RemoteIsNewer) {
      if (confirm(`${e.message}

그래도 지금 휴대폰 장부로 덮어쓸까요?`)) return cloudPush(button, true);
      return;
    }
    if (e instanceof CloudError || e instanceof SecureBackupError) return toast(e.message, "error");
    throw e;
  }
}

async function cloudPull(button) {
  let bytes;
  try {
    bytes = await busy(button, () => pull(state.meta.cloud, cloudPassword()));
  } catch (e) {
    if (e instanceof CloudError || e instanceof SecureBackupError) return toast(e.message, "error");
    throw e;
  }
  if (!bytes) return toast("저장소에 아직 올린 장부가 없습니다.", "warn");
  await importBytes(bytes, "pull");
}

async function saveCloudForm(form) {
  const f = Object.fromEntries(new FormData(form));
  const button = form.querySelector("[type=submit]");
  try {
    if (f.password !== f.password2) throw new CloudError("백업 비밀번호와 확인이 다릅니다.");
    checkPassword(f.password);
    const cfg = makeConfig({ repo: f.repo, token: f.token, file: f.file, apiBase: state.meta.cloud?.apiBase });
    await busy(button, () => checkRepo(cfg));
    state.meta = await setMeta({ cloud: { ...cfg, password: f.remember ? f.password : "" } });
    toast(`연결했습니다: ${cfg.repo} (비공개 저장소)`);
    await show();
  } catch (e) {
    if (e instanceof CloudError || e instanceof SecureBackupError) return toast(e.message, "error");
    throw e;
  }
}

async function clearCloud() {
  if (!confirm("GitHub 연결 정보를 이 휴대폰에서 지웁니다. (저장소에 올린 파일은 그대로 있습니다)")) return;
  state.meta = await setMeta({ cloud: null });
  await show();
}

async function onSendFile() {
  const name = backupFileName(getSettings(state.db).team_name);
  const result = await sendBackup(state.db.export(), name);
  if (result === "cancel") return toast("백업 보내기를 취소했습니다.", "warn");
  state.meta = await setMeta({ lastBackupAt: new Date().toISOString(), lastBackupMethod: result });
  toast(result === "share" ? "백업 파일을 보냈습니다." : `다운로드 폴더에 저장했습니다: ${name}`);
  await show();
}

// ── 불러오기 ──
function askImport(info, current) {
  const dialog = $("import-dialog");
  $("import-summary").innerHTML =
    `팀 <b>${esc(info.team_name || "-")}</b> · 회원 ${info.members}명 · 회비 기록 ${info.dues}건 · 거래 ${info.transactions}건<br>` +
    `마지막 거래일 ${esc(info.last_tx_date || "-")} · 마지막 수정 ${esc(showTime(info.last_modified))} (${esc(info.last_device || "기기 모름")})`;

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
  await importBytes(new Uint8Array(await file.arrayBuffer()), "import");
}

async function importBytes(bytes, method) {
  let incoming;
  try {
    incoming = openLedger(state.SQL, bytes);
  } catch (e) {
    toast(e instanceof LedgerError ? e.message : `파일을 열 수 없습니다. (${e.message})`, "error");
    return;
  }
  const info = ledgerInfo(incoming);
  const current = state.db ? ledgerInfo(state.db) : null;
  if (!(await askImport(info, current))) {
    incoming.close();
    return;
  }
  if (state.db) await saveSafetyCopy(state.db.export());
  await saveLedger(incoming.export()); // 수정 시각은 파일에 적힌 그대로 (불러오기는 '수정'이 아님)
  // 불러온 파일은 보낸 쪽(PC 등)에 그대로 있으므로 그 시점을 백업으로 본다
  state.meta = await setMeta({ lastBackupAt: new Date().toISOString(), lastBackupMethod: method });
  state.db?.close();
  state.db = incoming;
  toast("장부를 불러왔습니다.");
  await show("home");
}

async function undoImport() {
  const safety = await loadSafetyCopy();
  if (!safety || !confirm(`${showTime(safety.savedAt)} 에 보관한 장부로 되돌립니다. 지금 장부는 그 대신 보관됩니다.`)) return;
  let restored;
  try {
    restored = openLedger(state.SQL, safety.bytes);
  } catch (e) {
    return toast(`보관본을 열 수 없습니다: ${e.message}`, "error");
  }
  await saveSafetyCopy(state.db.export()); // 되돌리기를 다시 되돌릴 수 있게 맞바꿈
  await saveLedger(safety.bytes);
  state.db.close();
  state.db = restored;
  toast("불러오기 전 장부로 되돌렸습니다.");
  await show();
}

async function clearAll() {
  if (!confirm("이 휴대폰에 저장된 장부를 지웁니다. 백업 파일을 보내 두셨나요?")) return;
  await clearLedger();
  state.db?.close();
  state.db = null;
  await show();
}

// ── 이벤트 ──
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action], [data-tab]");
  if (!el || el.closest("#sheet")) return; // 입력 창 안의 버튼은 입력 창이 처리
  if (el.dataset.tab) return show(el.dataset.tab);
  const handler = TABS[tab]?.[1];
  if (handler) {
    try {
      if (await handler(el.dataset.action, el)) return show(tab);
    } catch (ex) {
      toast(ex.message, "error");
      return show(tab);
    }
  }
  const actions = {
    import: () => $("file-input").click(),
    "send-backup": () => onSendBackup(el),
    "send-file": onSendFile,
    "cloud-push": () => cloudPush(el),
    "cloud-pull": () => cloudPull(el),
    "cloud-clear": clearCloud,
    "undo-import": undoImport,
    clear: clearAll,
  };
  actions[el.dataset.action]?.();
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "cloud-form") {
    e.preventDefault();
    saveCloudForm(e.target);
  }
  if (e.target.id === "settings-form") {
    e.preventDefault();
    saveSettingsForm(e.target).then(() => show());
  }
});
$("file-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ""; // 같은 파일을 다시 골라도 change 가 일어나게
  if (file) await importFile(file);
});

// ── 시작 ──
async function start() {
  try {
    state.SQL = await initSqlJs({ locateFile: (f) => `vendor/sql.js/${f}` });
  } catch (e) {
    setHeader("Futsal Manager", "시작할 수 없습니다");
    app.innerHTML = errorBox(`SQLite 를 불러오지 못했습니다. (${e.message})`);
    return;
  }
  requestPersist();
  state.meta = await getMeta();
  const saved = await loadLedger();
  if (saved) {
    try {
      state.db = openLedger(state.SQL, saved.bytes);
    } catch (e) {
      await show();
      app.insertAdjacentHTML("afterbegin", errorBox(`저장된 장부를 열 수 없습니다: ${e.message}`));
      return;
    }
  }
  await show("home");
}
start();
