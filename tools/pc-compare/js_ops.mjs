// 휴대폰 쪽: PC 와 같은 작업 목록을 같은 시작 파일에서 실행해 결과를 비교
import { readFileSync } from "node:fs";
const repo = await import("file:///D:/Git/fs_team_manager_mobile/js/db/repo.js");
const w = await import("file:///D:/Git/fs_team_manager_mobile/js/db/write.js");
const { SQL } = await import("file:///D:/Git/fs_team_manager_mobile/tests/helpers.js");

const [dir, start] = process.argv.slice(2);
const pc = JSON.parse(readFileSync(`${dir}/pc_result.json`, "utf8"));
const db = repo.openLedger(SQL, new Uint8Array(readFileSync(`${dir}/start_${start}.db`)));

function apply(op) {
  switch (op.op) {
    case "add_member": return w.addMember(db, op.data);
    case "update_member": return w.updateMember(db, op.id, op.data);
    case "delete_member": return w.deleteMember(db, op.id);
    case "set_dues": return w.setDues(db, op.changes);
    case "prepay": return w.recordPrepayment(db, op.id, op.start, op.months, op.amount, op.paid_date, op.deposit);
    case "add_tx": return w.addTransaction(db, op.tx);
    case "update_tx": return w.updateTransaction(db, op.id, op.tx);
    case "delete_tx": return w.deleteTransaction(db, op.id);
  }
}

let outcomeDiff = 0;
pc.ops.forEach((op, i) => {
  let r = "ok";
  try { apply(op); } catch { r = "err"; }
  if (r !== pc.outcomes[i]) { outcomeDiff++; if (outcomeDiff <= 5) console.log(`작업 ${i} 결과 다름: PC ${pc.outcomes[i]} / 휴대폰 ${r}`, JSON.stringify(op)); }
});

const rows = (sql) => { const r = db.exec(sql)[0]; return r ? r.values : []; };
const js = {
  members: rows("SELECT * FROM members ORDER BY id"),
  dues: rows("SELECT * FROM dues ORDER BY id"),
  transactions: rows("SELECT * FROM transactions ORDER BY id"),
  settings: rows("SELECT key, value FROM settings WHERE key NOT IN ('last_modified', 'last_device')").sort(),
};
let tableDiff = 0;
for (const t of Object.keys(js)) {
  const a = JSON.stringify(pc.tables[t]), b = JSON.stringify(js[t]);
  if (a !== b) { tableDiff++; console.log(`표 ${t} 다름 (PC ${pc.tables[t].length}행 / 휴대폰 ${js[t].length}행)`); }
}
console.log(`작업 ${pc.ops.length}개 · 성공/실패 다름 ${outcomeDiff} · 표 다름 ${tableDiff} · 행 수 회원 ${js.members.length} 회비 ${js.dues.length} 거래 ${js.transactions.length}`);
process.exit(outcomeDiff || tableDiff ? 1 : 0);
