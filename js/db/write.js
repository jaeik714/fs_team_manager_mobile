// 장부 쓰기 — PC 버전 data/db.py 의 업무 규칙을 그대로 옮긴 것. 규칙이 어긋나면 PC·휴대폰 장부가 달라지므로
// PC 를 고치면 여기도 같이 고친다 (tests/write.test.js 가 PC 테스트와 같은 사례를 검사).
//
// 모든 쓰기는 write(db, fn) 안에서 한 번에 처리된다: 하나라도 실패하면 아무것도 저장되지 않고(ROLLBACK),
// 바뀐 행이 있으면 settings 에 last_modified(지금 시각)·last_device(휴대폰)를 함께 기록한다.
import { DEVICE } from "./schema.js";
import { DUE_STATUSES, TX_CATEGORIES, TX_TYPES, all, nowStamp, one, shiftMonth } from "./repo.js";

export class ValidationError extends Error {}

export const MEMBER_STATUSES = ["활동", "휴면"];
const NO_PAYMENT_STATUSES = ["미납", "면제"];          // 금액·입금일을 저장하지 않는 상태
const SETTLED_STATUSES = ["납부 완료", "면제"];        // 선납 계산 시 이미 정리된 달로 보고 건너뜀
export const MAX_PREPAY_MONTHS = 24;
// PC utils/theme.TEAMS 의 키 (유니폼 색 프리셋)
export const TEAM_COLORS = ["red", "red_black", "blue", "blaugrana", "sky", "yellow_black", "green", "purple", "orange", "navy_red"];
const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

// ── 실행 도우미 ──
function run(db, sql, params = []) {
  db.run(sql, params);
}
const lastId = (db) => one(db, "SELECT last_insert_rowid() AS id").id;
const totalChanges = (db) => one(db, "SELECT total_changes() AS n").n;

function writeSettings(db, values) {
  for (const [k, v] of Object.entries(values)) {
    run(db, "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [k, String(v)]);
  }
}

/** 마지막 수정 시각·기기 기록 (불러오기 때 '더 오래된 파일' 경고에 사용) */
export function touch(db, now = new Date()) {
  writeSettings(db, { last_modified: nowStamp(now), last_device: DEVICE });
}

/** 한 번에 저장(전부 또는 전무). 바뀐 행이 있으면 수정 시각 기록. */
export function write(db, fn) {
  db.exec("BEGIN");
  try {
    const before = totalChanges(db);
    const result = fn();
    if (totalChanges(db) > before) touch(db);
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function toInt(v, message) {
  const n = typeof v === "string" ? Number(v.trim()) : Number(v);
  if (v === null || v === undefined || v === "" || !Number.isInteger(n)) throw new ValidationError(message);
  return n;
}

// ── 팀 설정 ──
export function saveSettings(db, values) {
  if (!String(values.team_name ?? "").trim()) throw new ValidationError("팀 명칭을 입력해주세요.");
  const day = toInt(values.fee_due_day ?? 1, "납부 기준일은 1~31 사이여야 합니다.");
  if (day < 1 || day > 31) throw new ValidationError("납부 기준일은 1~31 사이여야 합니다.");
  if ("team_color" in values && !TEAM_COLORS.includes(values.team_color)) throw new ValidationError("알 수 없는 팀 컬러입니다.");
  write(db, () => writeSettings(db, values));
}

// ── 회원 ──
/** 숫자만 입력해도 010-1234-5678 형식으로 (PC utils/common.normalize_phone) */
export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  let phone;
  if (digits.length === 11) phone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  else if (digits.length === 10) phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  else phone = String(raw).trim();
  if (!PHONE_RE.test(phone)) throw new ValidationError("연락처 형식이 올바르지 않습니다. (예: 010-1234-5678)");
  return phone;
}

function validateMember(db, data, excludeId = null) {
  const name = String(data.name ?? "").trim();
  if (!name) throw new ValidationError("회원명을 입력해주세요.");
  if (!MEMBER_STATUSES.includes(data.status)) throw new ValidationError("활동 상태가 올바르지 않습니다.");
  let back = data.back_number ?? null;
  if (back !== null && back !== "") {
    back = toInt(back, "등번호는 1~99 사이여야 합니다.");
    if (back < 1 || back > 99) throw new ValidationError("등번호는 1~99 사이여야 합니다.");
    const row = one(db, "SELECT name FROM members WHERE back_number = ? AND id IS NOT ?", [back, excludeId]);
    if (row) throw new ValidationError(`등번호 ${back}번은 이미 '${row.name}' 회원이 사용 중입니다.`);
  } else back = null;
  if (!data.reg_date) throw new ValidationError("가입일을 입력해주세요.");
  return [name, data.birth_year ? toInt(data.birth_year, "출생연도가 올바르지 않습니다.") : null,
    String(data.phone ?? "").trim(), String(data.reg_date), back, data.status];
}

export function addMember(db, data) {
  return write(db, () => {
    run(db, "INSERT INTO members(name, birth_year, phone, reg_date, back_number, status) VALUES (?, ?, ?, ?, ?, ?)",
      validateMember(db, data));
    return lastId(db);
  });
}

export function updateMember(db, id, data) {
  write(db, () => {
    run(db, "UPDATE members SET name=?, birth_year=?, phone=?, reg_date=?, back_number=?, status=? WHERE id=?",
      [...validateMember(db, data, id), id]);
  });
}

/** 회원과 그 회원의 회비 기록을 함께 삭제 (ON DELETE CASCADE) */
export function deleteMember(db, id) {
  write(db, () => run(db, "DELETE FROM members WHERE id = ?", [id]));
}

// ── 거래 ──
export function cleanTransaction(txDate, description, txType, amount, category = "기타", memo = "", ledgerMonth = null) {
  description = String(description ?? "").trim();
  if (!description) throw new ValidationError("거래 내용을 입력해주세요.");
  if (!TX_TYPES.includes(txType)) throw new ValidationError("거래 구분이 올바르지 않습니다.");
  if (!TX_CATEGORIES.includes(category)) throw new ValidationError("거래 분류가 올바르지 않습니다.");
  const n = Number(amount);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("금액은 0원보다 커야 합니다.");
  if (!txDate) throw new ValidationError("거래일을 입력해주세요.");
  txDate = String(txDate);
  if (ledgerMonth) {
    const m = /^(\d{1,4})-(\d{1,2})$/.exec(String(ledgerMonth));
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1) throw new ValidationError("장부 월은 YYYY-MM 형식이어야 합니다.");
    ledgerMonth = `${m[1].padStart(4, "0")}-${m[2].padStart(2, "0")}`;
    if (ledgerMonth === txDate.slice(0, 7)) ledgerMonth = null; // 거래일과 같은 달이면 기본값이므로 저장하지 않음
  }
  const [deposit, withdrawal] = txType === "입금" ? [n, 0] : [0, n];
  return { date: txDate, description, deposit, withdrawal, category, memo: String(memo ?? "").trim(), ledger_month: ledgerMonth || null };
}

function insertTx(db, t) {
  run(db, "INSERT INTO transactions(date, description, deposit, withdrawal, category, memo, ledger_month) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [t.date, t.description, t.deposit, t.withdrawal, t.category, t.memo, t.ledger_month]);
  return lastId(db);
}

/** tx = { date, description, type: 입금|지출, amount, category, memo, ledger_month } */
export function addTransaction(db, tx) {
  const t = cleanTransaction(tx.date, tx.description, tx.type, tx.amount, tx.category ?? "기타", tx.memo ?? "", tx.ledger_month ?? null);
  return write(db, () => insertTx(db, t));
}

export function updateTransaction(db, id, tx) {
  const t = cleanTransaction(tx.date, tx.description, tx.type, tx.amount, tx.category ?? "기타", tx.memo ?? "", tx.ledger_month ?? null);
  write(db, () => run(db, "UPDATE transactions SET date=?, description=?, deposit=?, withdrawal=?, category=?, memo=?, ledger_month=? WHERE id=?",
    [t.date, t.description, t.deposit, t.withdrawal, t.category, t.memo, t.ledger_month, id]));
}

/** 통장에서 입금을 지워도 납부 기록은 남는다 (dues.tx_id 는 ON DELETE SET NULL) */
export function deleteTransaction(db, id) {
  write(db, () => run(db, "DELETE FROM transactions WHERE id = ?", [id]));
}

// ── 회비 ──
export function cleanDue(memberId, ym, status, amount = 0, paidDate = null) {
  if (!DUE_STATUSES.includes(status)) throw new ValidationError("납부 상태가 올바르지 않습니다.");
  if (NO_PAYMENT_STATUSES.includes(status)) {
    amount = 0;
    paidDate = null;
  } else {
    if (!amount || !(Number(amount) > 0)) throw new ValidationError("납부 금액을 입력해주세요.");
    if (!paidDate) throw new ValidationError("입금일을 입력해주세요.");
  }
  return [toInt(memberId, "회원을 찾을 수 없습니다."), ym, Math.trunc(Number(amount || 0)), status, paidDate ? String(paidDate) : null];
}

const UPSERT_DUE = "INSERT INTO dues(member_id, year_month, amount, status, paid_date) VALUES (?, ?, ?, ?, ?) " +
  "ON CONFLICT(member_id, year_month) DO UPDATE SET amount = excluded.amount, status = excluded.status, paid_date = excluded.paid_date";

/**
 * 납부 기록 1건 저장 + 연결된 모임통장 입금 맞추기 (PC _save_due_synced 와 같음)
 * - '납부 완료': 그 달 장부에 회비 입금(내용=회원 이름) 1건을 만들어 연결. 연결된 입금이 있으면 날짜·금액·장부 월 맞춤.
 *   여러 달이 공유하는 입금(선납)은 그대로. 연결 없이 원래 '납부 완료'였던 기록은 새로 만들지 않음(이중 입금 방지)
 * - '납부 완료'가 아니게 되면: 연결된 입금 삭제. 공유 입금이면 이 달 금액만큼 줄임
 */
function saveDueSynced(db, row, counts) {
  const [memberId, ym, amount, status, paidDate] = row;
  const old = one(db, "SELECT status, amount, tx_id FROM dues WHERE member_id = ? AND year_month = ?", [memberId, ym]);
  const txId = old?.tx_id ?? null;
  const shared = !!txId && one(db, "SELECT COUNT(*) AS n FROM dues WHERE tx_id = ?", [txId]).n > 1;
  run(db, UPSERT_DUE, row);
  if (status === "납부 완료") {
    const name = one(db, "SELECT name FROM members WHERE id = ?", [memberId]).name;
    const tx = cleanTransaction(paidDate, name, "입금", amount, "회비", "", ym);
    if (txId && !shared) {
      run(db, "UPDATE transactions SET date = ?, deposit = ?, withdrawal = 0, ledger_month = ? WHERE id = ?",
        [tx.date, tx.deposit, tx.ledger_month, txId]);
      counts.updated++;
    } else if (!txId && !(old && old.status === "납부 완료")) {
      const newId = insertTx(db, tx);
      run(db, "UPDATE dues SET tx_id = ? WHERE member_id = ? AND year_month = ?", [newId, memberId, ym]);
      counts.created++;
    }
  } else if (txId) {
    run(db, "UPDATE dues SET tx_id = NULL WHERE member_id = ? AND year_month = ?", [memberId, ym]);
    const left = one(db, "SELECT deposit FROM transactions WHERE id = ?", [txId]);
    if (shared && left && left.deposit - old.amount > 0) {
      run(db, "UPDATE transactions SET deposit = deposit - ? WHERE id = ?", [old.amount, txId]);
      counts.updated++;
    } else {
      run(db, "DELETE FROM transactions WHERE id = ?", [txId]);
      counts.deleted++;
    }
  }
}

/**
 * 여러 회원의 납부 상태를 한 번에 저장. 하나라도 규칙에 어긋나면 아무것도 저장하지 않는다.
 * changes: [{ member_id, year_month, status, amount, paid_date, label }]
 * 반환: 모임통장 입금 { created, updated, deleted } 건수
 */
export function setDues(db, changes) {
  const rows = [], errors = [];
  for (const c of changes) {
    try {
      rows.push(cleanDue(c.member_id, c.year_month, c.status, c.amount, c.paid_date));
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      errors.push(`${c.label ?? c.member_id}: ${e.message}`);
    }
  }
  if (errors.length) throw new ValidationError(errors.join(" / "));
  const counts = { created: 0, updated: 0, deleted: 0 };
  write(db, () => rows.forEach((r) => saveDueSynced(db, r, counts)));
  return counts;
}

export function setDue(db, memberId, ym, status, amount = 0, paidDate = null) {
  return setDues(db, [{ member_id: memberId, year_month: ym, status, amount, paid_date: paidDate }]);
}

/** 선납 적용 달 계산: start 부터 차례로, 이미 '납부 완료'·'면제'인 달은 건너뛰고 months 개 */
export function planPrepayment(db, memberId, startMonth, months) {
  const existing = Object.fromEntries(all(db, "SELECT year_month, status FROM dues WHERE member_id = ?", [memberId])
    .map((r) => [r.year_month, r.status]));
  const chosen = [], skipped = [];
  let ym = startMonth;
  for (let i = 0; i < months + 120 && chosen.length < months; i++) {
    if (SETTLED_STATUSES.includes(existing[ym])) skipped.push([ym, existing[ym]]);
    else chosen.push(ym);
    ym = shiftMonth(ym, 1);
  }
  return { months: chosen, skipped };
}

/** 선납 등록: 고른 달들을 '납부 완료'(같은 입금일)로 저장하고, 원하면 모임통장에 합계 입금 1건 (전부 또는 전무) */
export function recordPrepayment(db, memberId, startMonth, months, amountPerMonth, paidDate, addDeposit = true) {
  months = toInt(months, `선납 개월 수는 1~${MAX_PREPAY_MONTHS}개월이어야 합니다.`);
  if (months < 1 || months > MAX_PREPAY_MONTHS) throw new ValidationError(`선납 개월 수는 1~${MAX_PREPAY_MONTHS}개월이어야 합니다.`);
  const member = one(db, "SELECT name FROM members WHERE id = ?", [memberId]);
  if (!member) throw new ValidationError("회원을 찾을 수 없습니다.");
  const plan = planPrepayment(db, memberId, startMonth, months);
  const rows = plan.months.map((ym) => cleanDue(memberId, ym, "납부 완료", amountPerMonth, paidDate));
  const total = Math.trunc(Number(amountPerMonth)) * rows.length;
  const first = plan.months[0], last = plan.months.at(-1);
  const tx = addDeposit
    ? cleanTransaction(paidDate, member.name, "입금", total, "회비", `${rows.length}개월 선납 (${first === last ? first : `${first}~${last}`})`, null)
    : null;
  const txId = write(db, () => {
    rows.forEach((r) => run(db, UPSERT_DUE, r));
    if (!tx) return null;
    const id = insertTx(db, tx);
    plan.months.forEach((ym) => run(db, "UPDATE dues SET tx_id = ? WHERE member_id = ? AND year_month = ?", [id, memberId, ym]));
    return id; // 여러 달이 입금 1건을 공유
  });
  return { ...plan, total, tx_id: txId, name: member.name };
}
