// PC tests/test_db.py · test_dues_bank_link.py · test_prepay.py 와 같은 사례 (업무 규칙이 같은지 검사)
import assert from "node:assert/strict";
import { test } from "node:test";
import { getMonthDues, getSettings, getTransaction, isPrepaid, listTransactions, monthLedger, nextFreeBackNumber, one,
  openLedger, shiftMonth, summarizeDues, transactionMonths } from "../js/db/repo.js";
import * as w from "../js/db/write.js";
import { SQL, emptyLedgerBytes } from "./helpers.js";

const fresh = () => openLedger(SQL, emptyLedgerBytes({ last_modified: "2000-01-01 00:00:00", last_device: "PC" }));
const member = (name = "홍길동", { back = null, status = "활동", reg = "2026-01-01" } = {}) =>
  ({ name, birth_year: 1990, phone: "", reg_date: reg, back_number: back, status });
const add = (db, ...a) => w.addMember(db, member(...a));
const feeTxs = (db) => listTransactions(db).filter((t) => t.category === "회비");
const tx = (date, description, type, amount, category = "기타", extra = {}) => ({ date, description, type, amount, category, ...extra });

// ── 수정 시각 기록 ──
test("저장하면 수정 시각·기기(휴대폰) 기록, 조회만으로는 그대로", () => {
  const db = fresh();
  getMonthDues(db, "2026-11");
  listTransactions(db);
  assert.equal(getSettings(db).last_modified, "2000-01-01 00:00:00");
  add(db, "가");
  const s = getSettings(db);
  assert.ok(s.last_modified > "2000-01-01 00:00:00");
  assert.equal(s.last_device, "휴대폰");
});

test("규칙 위반이면 아무것도 저장하지 않고 수정 시각도 그대로", () => {
  const db = fresh();
  const m = add(db, "가");
  w.touch(db, new Date(2000, 0, 1));
  assert.throws(() => w.setDues(db, [
    { member_id: m, year_month: "2026-11", status: "납부 완료", amount: 30000, paid_date: "2026-11-01" },
    { member_id: m, year_month: "2026-12", status: "납부 완료", amount: 0, paid_date: "2026-12-01", label: "가 12월" }]),
  /가 12월: 납부 금액/);
  assert.deepEqual(listTransactions(db), []);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM dues").n, 0);
  assert.equal(getSettings(db).last_modified, "2000-01-01 00:00:00");
});

test("쓰기 도중 오류가 나면 앞서 쓴 것도 되돌림 (ROLLBACK)", () => {
  const db = fresh();
  assert.throws(() => w.write(db, () => {
    db.run("INSERT INTO transactions(date, description, deposit) VALUES ('2026-11-01', 'x', 1)");
    throw new Error("중간 실패");
  }));
  assert.deepEqual(listTransactions(db), []);
});

// ── 회원 (test_db.py) ──
test("회원 ID 는 삭제 후에도 재사용하지 않음", () => {
  const db = fresh();
  const a = add(db, "A"), b = add(db, "B");
  w.deleteMember(db, b);
  assert.equal(new Set([a, b, add(db, "C")]).size, 3);
});

test("등번호 중복 금지, 자기 자신은 허용, 다음 빈 번호", () => {
  const db = fresh();
  const id = add(db, "A", { back: 7 });
  assert.throws(() => add(db, "B", { back: 7 }), /7번은 이미 'A'/);
  w.updateMember(db, id, member("A2", { back: 7 }));
  assert.equal(nextFreeBackNumber(db), 1);
  assert.throws(() => add(db, "C", { back: 100 }), w.ValidationError);
});

test("이름 바꾸면 회비 목록에 반영, 회원 삭제 시 회비 기록도 삭제", () => {
  const db = fresh();
  const id = add(db, "옛이름");
  w.setDue(db, id, "2026-11", "납부 완료", 20000, "2026-11-05");
  w.updateMember(db, id, member("새이름"));
  assert.equal(getMonthDues(db, "2026-11")[0].member_name, "새이름");
  w.deleteMember(db, id);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM dues").n, 0);
});

test("연락처 형식 맞추기", () => {
  assert.equal(w.normalizePhone("01012345678"), "010-1234-5678");
  assert.equal(w.normalizePhone("0101234567"), "010-123-4567");
  assert.equal(w.normalizePhone(""), "");
  assert.throws(() => w.normalizePhone("12345"), /연락처 형식/);
});

// ── 회비 ──
test("회비 대상자: 활동·가입한 회원만, 조회는 기록을 만들지 않음, 휴면이라도 기록 있으면 표시", () => {
  const db = fresh();
  const active = add(db, "활동");
  const dormant = add(db, "휴면", { status: "휴면" });
  add(db, "미래가입", { reg: "2026-12-01" });
  const rows = getMonthDues(db, "2026-11");
  assert.deepEqual(rows.map((r) => r.member_id), [active]);
  assert.equal(rows[0].status, "미납");
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM dues").n, 0);
  w.setDue(db, dormant, "2026-11", "납부 완료", 20000, "2026-11-01");
  assert.deepEqual(getMonthDues(db, "2026-11").map((r) => r.member_id), [active, dormant]);
});

test("미납은 금액·입금일 지움, 납부 완료는 금액 필수", () => {
  const db = fresh();
  const id = add(db);
  w.setDue(db, id, "2026-11", "미납", 20000, "2026-11-01");
  const r = getMonthDues(db, "2026-11")[0];
  assert.deepEqual([r.amount, r.paid_date], [0, ""]);
  assert.throws(() => w.setDue(db, id, "2026-11", "납부 완료", 0, "2026-11-01"), w.ValidationError);
});

test("면제는 납부율에서 빠지고 금액을 저장하지 않음", () => {
  const db = fresh();
  const [a, b, c] = ["A", "B", "C"].map((n) => add(db, n));
  w.setDue(db, a, "2026-11", "납부 완료", 20000, "2026-11-05");
  w.setDue(db, b, "2026-11", "면제", 20000, "2026-11-05");
  const rows = Object.fromEntries(getMonthDues(db, "2026-11").map((r) => [r.member_id, r]));
  assert.deepEqual([rows[b].status, rows[b].amount, rows[b].paid_date], ["면제", 0, ""]);
  const s = summarizeDues(Object.values(rows));
  assert.deepEqual([s.total, s.listed, s.counts["면제"], s.counts["미납"], s.rate], [2, 3, 1, 1, 50]);
  assert.equal(rows[c].status, "미납");
});

// ── 회비 ↔ 모임통장 (test_dues_bank_link.py) ──
test("납부 완료 → 그 달 장부에 회비 입금 생성", () => {
  const db = fresh();
  const m = add(db);
  assert.deepEqual(w.setDue(db, m, "2026-11", "납부 완료", 30000, "2026-11-01"), { created: 1, updated: 0, deleted: 0 });
  const [t] = feeTxs(db);
  assert.deepEqual([t.date, t.description, t.deposit], ["2026-11-01", "홍길동", 30000]);
  assert.ok(transactionMonths(db).includes("2026-11"));
  assert.equal(monthLedger(db, "2026-11").income, 30000);
});

test("미리 낸 회비(10/30 에 낸 11월분)는 11월 장부로", () => {
  const db = fresh();
  w.setDue(db, add(db), "2026-11", "납부 완료", 30000, "2026-10-30");
  const [t] = feeTxs(db);
  assert.equal(t.ledger_month, "2026-11");
  assert.equal(monthLedger(db, "2026-11").income, 30000);
});

test("수정하면 연결 입금도 수정, 미납으로 바꾸면 입금 삭제", () => {
  const db = fresh();
  const m = add(db);
  w.setDue(db, m, "2026-11", "납부 완료", 30000, "2026-11-01");
  assert.equal(w.setDue(db, m, "2026-11", "납부 완료", 60000, "2026-11-07").updated, 1);
  const [t] = feeTxs(db);
  assert.deepEqual([t.date, t.deposit, listTransactions(db).length], ["2026-11-07", 60000, 1]);
  assert.equal(w.setDue(db, m, "2026-11", "미납").deleted, 1);
  assert.deepEqual(listTransactions(db), []);
});

test("확인 중·면제는 입금을 만들지 않음, 확인 중 → 완료 때 생성", () => {
  const db = fresh();
  const m = add(db);
  w.setDue(db, m, "2026-11", "확인 중", 30000, "2026-11-01");
  w.setDue(db, m, "2026-12", "면제");
  assert.deepEqual(listTransactions(db), []);
  assert.equal(w.setDue(db, m, "2026-11", "납부 완료", 30000, "2026-11-02").created, 1);
});

test("선납은 입금 1건을 공유, 한 달 취소하면 그만큼 줄임", () => {
  const db = fresh();
  const m = add(db);
  w.recordPrepayment(db, m, "2026-11", 3, 30000, "2026-11-01");
  assert.equal(feeTxs(db)[0].deposit, 90000);
  w.setDue(db, m, "2026-12", "납부 완료", 30000, "2026-11-05");
  assert.deepEqual([feeTxs(db)[0].deposit, feeTxs(db).length], [90000, 1]);
  w.setDue(db, m, "2027-01", "미납");
  assert.equal(feeTxs(db)[0].deposit, 60000);
});

test("연결 없이 이미 납부 완료인 기록은 고쳐도 입금을 새로 만들지 않음", () => {
  const db = fresh();
  const m = add(db);
  w.recordPrepayment(db, m, "2026-11", 2, 30000, "2026-10-20", false);
  w.setDue(db, m, "2026-12", "납부 완료", 30000, "2026-10-21");
  assert.deepEqual(listTransactions(db), []);
});

test("통장에서 입금을 지워도 납부 기록은 남음", () => {
  const db = fresh();
  const m = add(db);
  w.setDue(db, m, "2026-11", "납부 완료", 30000, "2026-11-01");
  w.deleteTransaction(db, feeTxs(db)[0].id);
  assert.equal(getMonthDues(db, "2026-11").find((d) => d.member_id === m).status, "납부 완료");
});

// ── 선납 (test_prepay.py) ──
test("월 이동은 해를 넘김", () => {
  assert.equal(shiftMonth("2026-11", 3), "2027-02");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("선납은 이미 정리된 달을 건너뛰고 입금 기록", () => {
  const db = fresh();
  const m = add(db, "가");
  w.setDue(db, m, "2026-12", "면제");
  w.setDue(db, m, "2027-01", "납부 완료", 30000, "2026-11-01");
  const r = w.recordPrepayment(db, m, "2026-11", 3, 30000, "2026-11-04");
  assert.deepEqual(r.months, ["2026-11", "2027-02", "2027-03"]);
  assert.deepEqual(r.skipped.map(([ym]) => ym), ["2026-12", "2027-01"]);
  for (const ym of r.months) {
    const d = getMonthDues(db, ym).find((x) => x.member_id === m);
    assert.deepEqual([d.status, d.amount, d.paid_date], ["납부 완료", 30000, "2026-11-04"]);
  }
  const t = getTransaction(db, r.tx_id);
  assert.deepEqual([t.deposit, t.category, t.description, t.memo], [90000, "회비", "가", "3개월 선납 (2026-11~2027-03)"]);
});

test("선납 표시와 입금 없이 등록", () => {
  const db = fresh();
  const m = add(db, "가");
  const r = w.recordPrepayment(db, m, "2026-11", 2, 30000, "2026-11-04", false);
  assert.equal(r.tx_id, null);
  const [nov, dec] = ["2026-11", "2026-12"].map((ym) => getMonthDues(db, ym).find((d) => d.member_id === m));
  assert.equal(isPrepaid(nov), false);
  assert.equal(isPrepaid(dec), true);
});

test("선납 입력이 틀리면 아무것도 저장하지 않음", () => {
  const db = fresh();
  const m = add(db, "가");
  assert.throws(() => w.recordPrepayment(db, m, "2026-11", 3, 30000, ""), w.ValidationError);
  assert.throws(() => w.recordPrepayment(db, m, "2026-11", 0, 30000, "2026-11-04"), w.ValidationError);
  assert.ok(getMonthDues(db, "2026-11").every((d) => d.status === "미납"));
  assert.deepEqual(listTransactions(db), []);
});

// ── 거래·장부 월 (test_db.py) ──
test("장부 월 지정: 다른 달 장부로, 잔액은 어디서나 일치", () => {
  const db = fresh();
  w.addTransaction(db, tx("2026-08-01", "시작", "입금", 100000));
  w.addTransaction(db, tx("2026-08-20", "음료수", "지출", 10000, "운영비"));
  const late = w.addTransaction(db, tx("2026-08-31", "홍길동", "입금", 30000, "회비", { ledger_month: "2026-09" }));
  w.addTransaction(db, tx("2026-09-05", "구장", "지출", 50000, "구장 예약", { memo: "친선경기" }));
  const aug = monthLedger(db, "2026-08"), sep = monthLedger(db, "2026-09");
  assert.deepEqual(aug.rows.map((t) => t.description), ["시작", "음료수"]);
  assert.deepEqual(sep.rows.map((t) => t.description), ["홍길동", "구장"]);
  assert.equal(sep.opening, 90000);
  assert.equal(aug.closing, 90000);
  assert.deepEqual([sep.income, sep.expense, sep.closing, sep.rows.at(-1).balance], [30000, 50000, 70000, 70000]);
  assert.deepEqual(transactionMonths(db), ["2026-09", "2026-08"]);

  w.updateTransaction(db, late, tx("2026-08-31", "홍길동", "입금", 30000, "회비", { ledger_month: "2026-08" }));
  assert.equal(getTransaction(db, late).ledger_month, null);
  assert.throws(() => w.addTransaction(db, tx("2026-09-01", "x", "입금", 1, "회비", { ledger_month: "2026/9" })), w.ValidationError);
  assert.throws(() => w.addTransaction(db, tx("2026-09-01", "x", "입금", 1, "없는분류")), w.ValidationError);
  assert.throws(() => w.addTransaction(db, tx("2026-09-01", " ", "입금", 1)), /거래 내용/);
});

test("팀 설정 검사", () => {
  const db = fresh();
  assert.throws(() => w.saveSettings(db, { team_name: " ", fee_due_day: 25 }), /팀 명칭/);
  assert.throws(() => w.saveSettings(db, { team_name: "A", fee_due_day: 32 }), /1~31/);
  assert.throws(() => w.saveSettings(db, { team_name: "A", fee_due_day: 25, team_color: "pink" }), /팀 컬러/);
  w.saveSettings(db, { team_name: "새 팀", monthly_fee: 30000, fee_due_day: 10, team_color: "sky" });
  const s = getSettings(db);
  assert.deepEqual([s.team_name, s.monthly_fee, s.fee_due_day, s.team_color], ["새 팀", 30000, 10, "sky"]);
});
