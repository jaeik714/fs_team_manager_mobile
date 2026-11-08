// 회원: 목록(검색·활동/휴면), 등록, 눌러서 수정·삭제. 목록에서는 연락처 가운데 자리를 가린다.
import { listMembers, nextFreeBackNumber } from "../db/repo.js";
import { MEMBER_STATUSES, addMember, deleteMember, normalizePhone, updateMember } from "../db/write.js";
import { esc, persist, setHeader, state, toast } from "../state.js";
import { maskPhone, openSheet, segmented, today } from "../ui.js";
import { getSettings } from "../db/repo.js";

const view = { status: "활동", search: "" };

export function renderMembers(app) {
  const all = listMembers(state.db);
  const shown = listMembers(state.db, { status: view.status === "전체" ? null : view.status, search: view.search || null });
  const count = (s) => all.filter((m) => m.status === s).length;
  setHeader(getSettings(state.db).team_name || "Futsal Manager", "회원", `활동 ${count("활동")}명 · 휴면 ${count("휴면")}명`);
  app.innerHTML = `
    <label class="field search"><span class="sr-only">이름 검색</span>
      <input type="search" id="member-search" placeholder="이름 검색" value="${esc(view.search)}" autocomplete="off"></label>
    <div class="chips">${["활동", "휴면", "전체"].map((s) => `<button class="chip" data-action="member-filter" data-status="${s}" aria-pressed="${s === view.status}">${s}${s === "전체" ? ` ${all.length}` : ` ${count(s)}`}</button>`).join("")}</div>
    <button class="btn primary" data-action="member-add">＋ 회원 등록</button>
    ${shown.length ? `<ul class="list">${shown.map((m) => `
      <li data-action="member-edit" data-id="${m.id}">
        <span class="who">${m.back_number ? `<span class="num">${m.back_number}</span>` : `<span class="num empty">–</span>`}<b>${esc(m.name)}</b>
          ${m.status === "휴면" ? `<span class="badge s-1">휴면</span>` : ""}</span>
        <span class="muted small">${esc(maskPhone(m.phone))}</span>
      </li>`).join("")}</ul>` : `<p class="muted">해당하는 회원이 없습니다.</p>`}`;
  const input = app.querySelector("#member-search");
  input.addEventListener("input", () => {
    view.search = input.value;
    const pos = input.selectionStart;
    renderMembers(app);
    const again = app.querySelector("#member-search");
    again.focus();
    again.setSelectionRange(pos, pos);
  });
}

function memberForm(m = null) {
  const free = nextFreeBackNumber(state.db);
  return `
    <label class="field">이름<input name="name" value="${esc(m?.name ?? "")}" autocomplete="off"></label>
    <div class="row2">
      <label class="field">등번호 (선택)<input name="back_number" type="number" inputmode="numeric" min="1" max="99" value="${m?.back_number ?? ""}" placeholder="${free ? `비어 있는 번호 예: ${free}` : ""}"></label>
      <label class="field">출생연도 (선택)<input name="birth_year" type="number" inputmode="numeric" min="1900" max="2100" value="${m?.birth_year ?? ""}"></label>
    </div>
    <label class="field">연락처 (선택)<input name="phone" type="tel" inputmode="tel" value="${esc(m?.phone ?? "")}" placeholder="01012345678"></label>
    <label class="field">가입일<input name="reg_date" type="date" value="${m?.reg_date ?? today()}"></label>
    <div class="field">활동 상태${segmented("status", MEMBER_STATUSES, m?.status ?? "활동")}</div>
    <p class="muted small">휴면 회원은 그 달 회비 대상에서 빠집니다. (이미 기록이 있는 달은 그대로 표시)</p>`;
}

const fromForm = (f) => ({ name: f.name, back_number: f.back_number || null, birth_year: f.birth_year || null,
  phone: normalizePhone(f.phone), reg_date: f.reg_date, status: f.status });

async function addM() {
  const res = await openSheet({ title: "회원 등록", submitLabel: "등록", body: memberForm(), onSubmit: (f) => addMember(state.db, fromForm(f)) });
  if (res) {
    await persist();
    toast(`${res.data.name.trim()} 회원을 등록했습니다.`);
  }
}

async function editM(id) {
  const m = listMembers(state.db).find((x) => x.id === id);
  const res = await openSheet({ title: "회원 수정", deletable: true, body: memberForm(m), onSubmit: (f) => updateMember(state.db, id, fromForm(f)) });
  if (!res) return;
  if (res.action === "delete") {
    if (!confirm(`'${m.name}' 회원을 삭제할까요?\n이 회원의 회비 납부 기록도 모두 함께 삭제됩니다. (모임통장 거래는 남음)\n그만둔 회원은 삭제 대신 '휴면'으로 바꾸는 것을 권장합니다.`)) return;
    deleteMember(state.db, id);
    toast(`${m.name} 회원을 삭제했습니다.`, "warn");
  } else {
    toast("회원 정보를 수정했습니다.");
  }
  await persist();
}

export async function onMembersAction(action, el) {
  if (action === "member-filter") view.status = el.dataset.status;
  else if (action === "member-add") await addM();
  else if (action === "member-edit") await editM(Number(el.dataset.id));
  else return false;
  return true;
}
