import assert from "node:assert/strict";
import { test } from "node:test";
import { LedgerError, compareFreshness, dashboard, ledgerInfo, monthEnd, nowStamp, openLedger } from "../js/db/repo.js";
import { SCHEMA_VERSION } from "../js/db/schema.js";
import { SQL, emptyLedgerBytes } from "./helpers.js";

function sampleDb() {
  const db = openLedger(SQL, emptyLedgerBytes());
  db.exec(`
    INSERT INTO members(name, reg_date, back_number, status) VALUES
      ('가', '2026-01-01', 7, '활동'), ('나', '2026-01-01', NULL, '활동'),
      ('다', '2026-01-01', 10, '활동'), ('라', '2026-12-01', NULL, '활동'),  -- 12월 가입: 11월 대상 아님
      ('마', '2026-01-01', NULL, '휴면');
    INSERT INTO dues(member_id, year_month, amount, status, paid_date) VALUES
      (1, '2026-11', 20000, '납부 완료', '2026-11-03'),
      (2, '2026-11', 20000, '확인 중', '2026-11-05'),
      (3, '2026-11', 0, '면제', NULL);
    INSERT INTO transactions(date, description, deposit, withdrawal, category, ledger_month) VALUES
      ('2026-10-30', '이월', 100000, 0, '기타', NULL),
      ('2026-10-31', '가', 20000, 0, '회비', '2026-11'),    -- 장부 월 지정: 11월로 계산
      ('2026-11-10', '구장 예약', 0, 50000, '구장 예약', NULL);`);
  return db;
}

test("대시보드 숫자: 대상자·납부율·잔액·월 증감 (PC 와 같은 규칙)", () => {
  const d = dashboard(sampleDb(), "2026-11");
  assert.equal(d.members, 5);
  assert.equal(d.active, 4);
  assert.equal(d.dues.listed, 3);          // 가·나·다 (라는 12월 가입, 마는 휴면)
  assert.equal(d.dues.total, 2);           // 면제 제외
  assert.equal(d.dues.rate, 50);
  assert.equal(d.dues.collected, 20000);
  assert.equal(d.dues.pending_amount, 20000);
  assert.deepEqual(d.unpaid.map((u) => u.member_name), ["나"]);
  assert.equal(d.balance, 70000);
  assert.equal(d.monthNet, -30000);        // 11월 장부: +20000(장부 월 지정) -50000
});

test("불러오기 검사: SQLite 아님·필수 표 없음·예전 버전·새 버전 거부", () => {
  assert.throws(() => openLedger(SQL, new TextEncoder().encode("hello")), LedgerError);
  const bare = new SQL.Database(); bare.exec("CREATE TABLE settings(key TEXT, value TEXT)");
  assert.throws(() => openLedger(SQL, bare.export()), /없는 표/);
  assert.throws(() => openLedger(SQL, emptyLedgerBytes({ schema_version: undefined })), /예전 PC 버전/);
  assert.throws(() => openLedger(SQL, emptyLedgerBytes({ schema_version: SCHEMA_VERSION + 1 })), /새로운 버전/);
});

test("장부 요약에 수정 시각·기기 포함", () => {
  const info = ledgerInfo(openLedger(SQL, emptyLedgerBytes({ last_device: "휴대폰" })));
  assert.equal(info.last_modified, "2026-11-07 14:20:00");
  assert.equal(info.last_device, "휴대폰");
  assert.equal(info.schema_version, SCHEMA_VERSION);
});

test("더 오래된 파일 판단 (PC compare_freshness 와 같은 결과)", () => {
  const f = (a, b) => compareFreshness({ last_modified: a }, { last_modified: b }).level;
  assert.equal(f("2026-11-07 14:20:00", "2026-11-08 09:10:00"), "older");
  assert.equal(f("2026-11-08 09:10:00", "2026-11-07 14:20:00"), "newer");
  assert.equal(f("2026-11-07 14:20:00", "2026-11-07 14:20:00"), "same");
  assert.equal(f("", "2026-11-07 14:20:00"), "unknown");
});

test("날짜 도우미", () => {
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(monthEnd("2026-12"), "2026-12-31");
  assert.equal(nowStamp(new Date(2026, 0, 2, 3, 4, 5)), "2026-01-02 03:04:05");
});
