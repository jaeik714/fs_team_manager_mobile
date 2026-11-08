import assert from "node:assert/strict";
import { test } from "node:test";
import { REMIND_DAYS, backupFileName, backupStatus, safeFileName, sendBackup } from "../js/db/backup.js";

const now = new Date(2026, 10, 20, 12, 0, 0); // 2026-11-20 12:00
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

test("백업 알림: 휴대폰에서 고친 뒤 7일 지나면", () => {
  const st = (lastBackupAt, lastModified, lastDevice = "휴대폰") => backupStatus({ lastBackupAt, lastModified, lastDevice, now });
  // 백업 후 고친 내용 있음 + 8일 경과 → 알림
  let s = st(daysAgo(8), "2026-11-15 10:00:00");
  assert.deepEqual([s.unsaved, s.days, s.due], [true, 8, true]);
  assert.match(s.message, /8일/);
  // 6일 경과 → 아직 알림 없음
  assert.equal(st(daysAgo(6), "2026-11-19 10:00:00").due, false);
  // 정확히 7일 → 알림
  assert.equal(st(daysAgo(REMIND_DAYS), "2026-11-19 10:00:00").due, true);
  // 백업 후 고친 내용이 없으면 오래돼도 알림 없음
  s = st(daysAgo(30), "2026-10-01 10:00:00");
  assert.deepEqual([s.unsaved, s.due], [false, false]);
  // PC 에서 고친 장부를 불러온 상태(마지막 수정 기기=PC)는 휴대폰에서 고친 내용이 아님
  assert.equal(st(daysAgo(30), "2026-11-19 10:00:00", "PC").unsaved, false);
  // 백업한 적이 없고 휴대폰에서 고쳤으면 바로 알림
  s = st(null, "2026-11-19 10:00:00");
  assert.deepEqual([s.days, s.due], [null, true]);
  assert.match(s.message, /아직 백업하지/);
});

test("백업 파일 이름", () => {
  assert.equal(backupFileName("FC 썬더볼츠 풋살클럽", new Date(2026, 10, 8, 9, 5)), "FC_썬더볼츠_풋살클럽_휴대폰백업_20261108_0905.db");
  assert.equal(safeFileName('a/b:c*?"<>|'), "a_b_c");
  assert.equal(safeFileName(""), "FutsalManager");
});

function fakeDoc() {
  const clicked = [];
  return { clicked, body: { appendChild() {} }, createElement: () => ({ click() { clicked.push(this.download); }, remove() {} }) };
}

test("보내기: 공유가 되면 공유, 취소하면 cancel, 안 되면 다운로드", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const shared = [];
  const ok = { canShare: () => true, share: async (d) => shared.push(d.files[0].name) };
  assert.equal(await sendBackup(bytes, "a.db", { nav: ok, doc: fakeDoc() }), "share");
  assert.deepEqual(shared, ["a.db"]);

  const cancel = { canShare: () => true, share: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); } };
  assert.equal(await sendBackup(bytes, "a.db", { nav: cancel, doc: fakeDoc() }), "cancel");

  for (const nav of [{ canShare: () => false }, {}, { canShare: () => true, share: async () => { throw new Error("NotAllowed"); } }]) {
    const doc = fakeDoc();
    assert.equal(await sendBackup(bytes, "b.db", { nav, doc }), "download");
    assert.deepEqual(doc.clicked, ["b.db"]);
  }
});
