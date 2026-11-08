// Node 테스트용: 저장소에 포함된 sql.js 를 그대로 불러온다 (브라우저와 같은 SQLite)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SCHEMA, SCHEMA_VERSION } from "../js/db/schema.js";

const require = createRequire(import.meta.url);
const initSqlJs = require("../vendor/sql.js/sql-wasm.js");
const wasmDir = fileURLToPath(new URL("../vendor/sql.js/", import.meta.url));

export const SQL = await initSqlJs({ locateFile: (f) => wasmDir + f });

/** 빈 장부(PC v1.8.0 과 같은 구조) 파일 내용 */
export function emptyLedgerBytes(meta = {}) {
  const db = new SQL.Database();
  db.exec(SCHEMA);
  const settings = { team_name: "테스트 FC", monthly_fee: 20000, fee_due_day: 25, schema_version: SCHEMA_VERSION,
    last_modified: "2026-11-07 14:20:00", last_device: "PC", ...meta };
  const stmt = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(settings)) if (v !== undefined) stmt.run([k, String(v)]);
  stmt.free();
  const bytes = db.export();
  db.close();
  return bytes;
}
