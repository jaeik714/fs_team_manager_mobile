// 팀 설정 (백업 화면 아래): 팀 명칭·월 회비·납부 기준일·계좌 정보·팀 컬러. 데이터 초기화는 PC 전용(실수 방지)
import { getSettings } from "../db/repo.js";
import { saveSettings } from "../db/write.js";
import { esc, persist, toast, state } from "../state.js";
import { TEAMS, applyTheme } from "../theme.js";

export function settingsSection() {
  const s = getSettings(state.db);
  const color = TEAMS[s.team_color] ? s.team_color : "red";
  return `
    <section class="hero" id="team-settings">
      <h2>팀 설정</h2>
      <form id="settings-form" class="form" autocomplete="off">
        <label class="field">팀 명칭<input name="team_name" value="${esc(s.team_name)}"></label>
        <div class="row2">
          <label class="field">월 회비 (원)<input name="monthly_fee" type="number" inputmode="numeric" min="0" step="5000" value="${s.monthly_fee}"></label>
          <label class="field">납부 기준일<input name="fee_due_day" type="number" inputmode="numeric" min="1" max="31" value="${s.fee_due_day}"></label>
        </div>
        <label class="field">모임통장 계좌 정보 (두 줄)<textarea name="bank_info" rows="2">${esc(s.bank_info ?? "")}</textarea></label>
        <div class="field">팀 컬러
          <div class="swatches">${Object.entries(TEAMS).map(([k, t]) => `
            <label class="swatch" title="${esc(t.label)}"><input type="radio" name="team_color" value="${k}" ${k === color ? "checked" : ""}>
              <span style="--a:${t.accent};--b:${t.band}"></span><em>${esc(t.label.replace(/ \(.*\)$/, ""))}</em></label>`).join("")}</div>
        </div>
        <button class="btn primary" type="submit">설정 저장</button>
      </form>
      <p class="muted small">샘플 데이터로 초기화·모든 데이터 삭제는 실수를 막기 위해 PC 프로그램에서만 할 수 있습니다.</p>
    </section>`;
}

export async function saveSettingsForm(form) {
  const f = Object.fromEntries(new FormData(form));
  try {
    saveSettings(state.db, { team_name: f.team_name.trim(), monthly_fee: Number(f.monthly_fee || 0), fee_due_day: Number(f.fee_due_day),
      bank_info: f.bank_info, team_color: f.team_color });
  } catch (e) {
    return toast(e.message, "error");
  }
  await persist();
  applyTheme(f.team_color);
  toast("팀 설정을 저장했습니다.");
}
