// 장부 읽기·검증·요약 — PC 버전 data/db.py, data/backup.py 와 같은 규칙.
// sql.js 의 Database 객체(db)를 받아 동작하므로 브라우저·Node 테스트에서 똑같이 쓴다.
import { SCHEMA, SCHEMA_VERSION } from "./schema.js";

export const DUE_STATUSES = ["납부 완료", "확인 중", "미납", "면제"];
export const EXEMPT = "면제";
const REQUIRED_TABLES = ["settings", "members", "dues", "transactions"];
const SQLITE_HEADER = "SQLite format 3\u0000";
// 장부 월: 따로 지정하지 않으면 거래일의 연월 (PC _LEDGER_MONTH)
const LEDGER_MONTH = "COALESCE(ledger_month, substr(date, 1, 7))";

export class LedgerError extends Error {}

/** SELECT 결과를 객체 배열로 */
export function all(db, sql, params = {}) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export function one(db, sql, params = {}) {
  return all(db, sql, params)[0] ?? null;
}

export function getSettings(db) {
  const s = Object.fromEntries(all(db, "SELECT key, value FROM settings").map((r) => [r.key, r.value]));
  return {
    ...s,
    team_name: s.team_name ?? "",
    monthly_fee: Number(s.monthly_fee ?? 20000),
    fee_due_day: Number(s.fee_due_day ?? 25),
    schema_version: Number(s.schema_version ?? 0),
    last_modified: s.last_modified ?? "",
    last_device: s.last_device ?? "",
  };
}

/**
 * 파일 내용(Uint8Array)으로 장부를 연다. PC data/backup.py _summary 와 같은 검사:
 * SQLite 파일인지, 필수 표, 무결성, 구조 버전.
 * 반환: sql.js Database (호출한 쪽에서 db.close() 책임)
 */
export function openLedger(SQL, bytes) {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 16));
  if (head !== SQLITE_HEADER) throw new LedgerError("Futsal Manager 장부 파일(.db)이 아닙니다.");
  let db;
  try {
    db = new SQL.Database(bytes);
    const tables = new Set(all(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missing.length) throw new LedgerError(`Futsal Manager 장부 파일이 아닙니다. (없는 표: ${missing.join(", ")})`);
    if (one(db, "PRAGMA integrity_check")?.integrity_check !== "ok") throw new LedgerError("장부 파일이 손상되었습니다.");
    const version = getSettings(db).schema_version;
    if (version > SCHEMA_VERSION) {
      throw new LedgerError("더 새로운 버전의 앱에서 만든 파일입니다. 휴대폰 앱을 새로고침해 최신 버전으로 업데이트하세요.");
    }
    if (version < 1) {
      // 이전 PC 버전의 구조 보완(마이그레이션)은 PC 가 맡는다 → 휴대폰은 v1.8.0 이상 파일만 받는다
      throw new LedgerError("예전 PC 버전에서 만든 파일입니다. PC 프로그램을 v1.8.0 이상으로 실행한 뒤 백업을 다시 내보내 주세요.");
    }
    db.exec(SCHEMA); // 빠진 인덱스 보완 (CREATE ... IF NOT EXISTS)
    db.exec("PRAGMA foreign_keys = ON");
    return db;
  } catch (e) {
    db?.close();
    if (e instanceof LedgerError) throw e;
    throw new LedgerError(`장부 파일을 읽을 수 없습니다. (${e.message})`);
  }
}

/** 장부 내용 요약 (불러오기 전 확인 화면용) */
export function ledgerInfo(db) {
  const s = getSettings(db);
  const count = (t) => one(db, `SELECT COUNT(*) AS n FROM ${t}`).n;
  return {
    team_name: s.team_name,
    members: count("members"),
    dues: count("dues"),
    transactions: count("transactions"),
    last_tx_date: one(db, "SELECT MAX(date) AS d FROM transactions").d ?? "",
    schema_version: s.schema_version,
    last_modified: s.last_modified,
    last_device: s.last_device,
  };
}

// ── 날짜 ──
const pad = (n) => String(n).padStart(2, "0");
export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const nowStamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export function monthEnd(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${pad(new Date(y, m, 0).getDate())}`;
}

/** 해당 월 회비 대상자별 납부 현황 (PC get_month_dues 와 같은 SQL) */
export function getMonthDues(db, ym) {
  return all(db, `
    SELECT m.id AS member_id, m.name AS member_name, m.back_number, m.status AS member_status,
           d.id AS due_id,
           COALESCE(d.amount, 0)     AS amount,
           COALESCE(d.status, '미납') AS status,
           COALESCE(d.paid_date, '') AS paid_date
    FROM members m
    LEFT JOIN dues d ON d.member_id = m.id AND d.year_month = :ym
    WHERE d.id IS NOT NULL OR (m.status = '활동' AND m.reg_date <= :end)
    ORDER BY m.id`, { ":ym": ym, ":end": monthEnd(ym) });
}

/** PC summarize_dues: total = 납부 대상(면제 제외), 납부율 = 납부 완료 / 대상 */
export function summarizeDues(monthDues) {
  const counts = Object.fromEntries(DUE_STATUSES.map((s) => [s, monthDues.filter((d) => d.status === s).length]));
  const total = monthDues.length - counts[EXEMPT];
  const sum = (status) => monthDues.filter((d) => d.status === status).reduce((a, d) => a + d.amount, 0);
  return {
    total,
    listed: monthDues.length,
    counts,
    rate: total ? (counts["납부 완료"] / total) * 100 : 0,
    collected: sum("납부 완료"),
    pending_amount: sum("확인 중"),
  };
}

/** 대시보드 숫자 (PC views/dashboard.py 와 같은 값) */
export function dashboard(db, ym = currentMonth()) {
  const settings = getSettings(db);
  const monthDues = getMonthDues(db, ym);
  const members = all(db, "SELECT status FROM members");
  const totals = one(db, "SELECT COALESCE(SUM(deposit), 0) AS dep, COALESCE(SUM(withdrawal), 0) AS wd FROM transactions");
  const monthNet = one(db, `SELECT COALESCE(SUM(deposit - withdrawal), 0) AS n FROM transactions WHERE ${LEDGER_MONTH} = :ym`,
    { ":ym": ym }).n;
  return {
    settings,
    month: ym,
    members: members.length,
    active: members.filter((m) => m.status === "활동").length,
    dues: summarizeDues(monthDues),
    unpaid: monthDues.filter((d) => d.status !== "납부 완료" && d.status !== EXEMPT),
    balance: totals.dep - totals.wd,
    monthNet,
  };
}

/**
 * 불러올 파일이 지금 장부보다 오래됐는지 (PC backup.compare_freshness 와 같은 판단).
 * level: older | unknown → 경고 + 추가 확인 / same | newer → 안내
 */
export function compareFreshness(incoming, current) {
  const a = incoming?.last_modified || "";
  const b = current?.last_modified || "";
  const when = (i) => (i?.last_modified ? `${i.last_device || "기기 모름"}, ${i.last_modified.slice(0, 16)} 수정` : "수정 시각 정보 없음");
  const src = when(incoming), cur = when(current);
  if (!a || !b) return { level: "unknown", message: `수정 시각을 비교할 수 없습니다. (불러올 파일: ${src} / 지금 장부: ${cur})` };
  if (a < b) return { level: "older", message: `불러올 파일(${src})이 지금 장부(${cur})보다 오래됐습니다. 덮어쓰면 그 사이에 기록한 내용이 사라집니다.` };
  if (a === b) return { level: "same", message: `지금 장부와 같은 시각에 마지막으로 수정된 파일입니다. (${src})` };
  return { level: "newer", message: `불러올 파일(${src})이 지금 장부(${cur})보다 최신입니다.` };
}
export const NEEDS_EXTRA_CONFIRM = ["older", "unknown"];
