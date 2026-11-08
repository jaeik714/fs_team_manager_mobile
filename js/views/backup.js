// 백업 화면: 백업 보내기(공유 창 또는 다운로드), 장부 파일 불러오기, 불러오기 전으로 되돌리기
import { REMIND_DAYS } from "../db/backup.js";
import { getSettings } from "../db/repo.js";
import { esc, setHeader, showTime, state } from "../state.js";
import { backupBanner, backupStatusNow } from "./home.js";

export function renderBackup(app, { hasSafety = false, safetyAt = null } = {}) {
  const s = getSettings(state.db);
  const status = backupStatusNow();
  const last = state.meta.lastBackupAt;
  const how = { share: "공유", download: "다운로드 폴더에 저장", import: "PC 등에서 불러옴" }[state.meta.lastBackupMethod] ?? "";
  setHeader(s.team_name || "Futsal Manager", "백업", "장부 파일 보내기 · 불러오기");

  app.innerHTML = `
    ${backupBanner()}
    <section class="card wide">
      <div class="label">마지막 백업</div>
      <div class="value small">${last ? `${esc(showTime(last))}` : "아직 없음"}</div>
      <div class="note">${last ? `${status.days === 0 ? "오늘" : `${status.days}일 전`}${how ? ` · ${esc(how)}` : ""}` : ""}</div>
      <div class="note">장부 마지막 수정: ${esc(showTime(s.last_modified))} (${esc(s.last_device || "기기 모름")})</div>
      <div class="note ${status.unsaved ? "neg" : "pos"}">${status.unsaved ? "백업 후 휴대폰에서 기록한 내용이 있습니다." : "백업 후 바뀐 내용이 없습니다."}</div>
    </section>

    <section class="hero">
      <h2>백업 보내기</h2>
      <p class="muted">장부 파일(.db)을 만들어 카카오톡 '나와의 채팅' 등으로 보냅니다. 휴대폰을 잃어버려도 이 파일로 PC·새 휴대폰에서 되살릴 수 있습니다.
        휴대폰에서 기록한 뒤 ${REMIND_DAYS}일이 지나도록 백업하지 않으면 첫 화면에서 알려 드립니다.</p>
      <button class="btn primary" data-action="send-backup">백업 보내기</button>
      <details class="help">
        <summary>공유 창이 열리지 않고 '다운로드'로 저장될 때</summary>
        <ol>
          <li>카카오톡 › <b>나와의 채팅</b> › 왼쪽 아래 <b>＋</b> › <b>파일</b></li>
          <li><b>다운로드</b> 폴더에서 <code>…_휴대폰백업_날짜.db</code> 선택 → 전송</li>
          <li>PC 에서는 카카오톡 PC 버전으로 파일을 받아 프로그램의 <b>백업·복원 › 백업 파일 올려서 복원</b></li>
        </ol>
      </details>
    </section>

    <section class="hero">
      <h2>장부 파일 불러오기</h2>
      <p class="muted">PC 에서 내려받은 백업 파일로 이 휴대폰의 장부를 바꿉니다. 지금 장부보다 오래된 파일이면 경고합니다.</p>
      <button class="btn" data-action="import">장부 파일 불러오기</button>
      ${hasSafety ? `<button class="btn" data-action="undo-import">불러오기 전으로 되돌리기 (${esc(showTime(safetyAt))} 보관본)</button>` : ""}
    </section>

    <button class="btn ghost" data-action="clear">이 휴대폰에서 장부 지우기</button>`;
}
