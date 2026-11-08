// 홈(대시보드): 이번 달 납부율·회비 수입·통장 잔액·미납 목록 + 백업 알림 띠
import { backupStatus } from "../db/backup.js";
import { dashboard, getSettings } from "../db/repo.js";
import { esc, krw, setHeader, signed, state } from "../state.js";

export function backupBanner() {
  const s = state.db ? backupStatusNow() : null;
  if (!s?.due) return "";
  return `<div class="banner" role="alert">
      <div><b>백업을 보내 주세요</b><br>${esc(s.message)}</div>
      <button class="btn primary" data-action="send-backup">지금 백업 보내기</button>
    </div>`;
}

export function backupStatusNow() {
  const settings = getSettings(state.db);
  return backupStatus({ lastBackupAt: state.meta.lastBackupAt, lastModified: settings.last_modified, lastDevice: settings.last_device });
}

export function renderHome(app) {
  const d = dashboard(state.db);
  const month = Number(d.month.split("-")[1]);
  const due = d.dues;
  setHeader(d.settings.team_name || "Futsal Manager", `MATCHDAY · ${month}월`, `납부 기한 ${month}월 ${d.settings.fee_due_day}일`);

  const unpaid = d.unpaid.length
    ? `<ul class="list">${d.unpaid.map((u) => `
        <li><span>${u.back_number ? `<b>${u.back_number}</b> ` : ""}${esc(u.member_name)}</span>
            <span class="badge ${u.status === "확인 중" ? "pending" : "unpaid"}">${esc(u.status)}</span></li>`).join("")}</ul>`
    : `<p class="muted">모두 납부했습니다. 👏</p>`;

  app.innerHTML = `
    ${backupBanner()}
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
    ${unpaid}`;
}
