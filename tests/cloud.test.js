// 비밀번호로 잠근 백업(.fmbk)과 GitHub 비공개 저장소 동기화 — 가짜 GitHub(fetch 흉내)로 검사, 인터넷 접속 없음
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_FILE, RemoteIsNewer, checkRepo, fromBase64, makeConfig, pull, push, toBase64 } from "../js/db/cloud.js";
import { getSettings, listMembers, openLedger } from "../js/db/repo.js";
import { SecureBackupError, isLocked, lock, readMeta, unlock } from "../js/db/secure.js";
import * as w from "../js/db/write.js";
import { SQL, emptyLedgerBytes } from "./helpers.js";

const PW = "풋살비번1234";
const fresh = (meta = {}) => openLedger(SQL, emptyLedgerBytes({ last_modified: "2026-11-08 09:00:00", last_device: "PC", ...meta }));

/** PC tests/fake_github.py 와 같은 동작의 가짜 GitHub */
function fakeGitHub({ repo = "me/data", token = "test-token" } = {}) {
  const gh = { private: true, push: true, files: new Map(), commits: [] };
  gh.fetch = async (url, opt) => {
    const reply = (status, body) => ({ status, ok: status < 300, json: async () => body, arrayBuffer: async () => body });
    if (opt.headers.Authorization !== `Bearer ${token}`) return reply(401, {});
    const m = /\/repos\/([^/]+\/[^/]+)(?:\/contents\/(.+))?$/.exec(new URL(url).pathname);
    if (!m || m[1] !== repo) return reply(404, {});
    if (!m[2]) return reply(200, { private: gh.private, permissions: { push: gh.push } });
    const old = gh.files.get(m[2]);
    if (opt.method === "GET") return old ? reply(200, { sha: old.sha, content: toBase64(old.content).replace(/(.{60})/g, "$1\n") }) : reply(404, {});
    if (!gh.push) return reply(403, {});
    const body = JSON.parse(opt.body);
    if ((old && body.sha !== old.sha) || (!old && body.sha)) return reply(409, {});
    const sha = `sha${gh.commits.length + 1}`;
    gh.files.set(m[2], { content: fromBase64(body.content), sha });
    gh.commits.push(body.message);
    return reply(old ? 200 : 201, { content: { sha } });
  };
  return gh;
}
const cfg = { repo: "me/data", file: DEFAULT_FILE, token: "test-token", apiBase: "https://fake" };

test("잠금·풀기, 정보는 비밀번호 없이 읽기, 틀린 비밀번호·바꿔치기 거부", async () => {
  const raw = fresh({ last_device: "휴대폰", last_modified: "2026-11-08 14:20:00" }).export();
  const blob = await lock(raw, PW, { schema_version: "1", last_modified: "2026-11-08 14:20:00", last_device: "휴대폰" }, 1000);
  assert.ok(isLocked(blob) && !isLocked(raw));
  const meta = readMeta(blob);
  assert.deepEqual([meta.schema_version, meta.last_modified, meta.last_device], [1, "2026-11-08 14:20:00", "휴대폰"]);
  assert.deepEqual(await unlock(blob, PW), raw);
  await assert.rejects(unlock(blob, "다른비밀번호123"), SecureBackupError);
  const forged = blob.slice();
  forged[20] ^= 1; // 정보 JSON 안의 한 글자 바꿈
  await assert.rejects(unlock(forged, PW), SecureBackupError);
  await assert.rejects(lock(raw, "short", {}), /8자/);
});

test("올리기 → 받아오기로 장부 그대로, 저장소에는 잠긴 파일만", async () => {
  const gh = fakeGitHub();
  const db = fresh();
  w.addMember(db, { name: "올린 회원", reg_date: "2026-01-01", status: "활동" });
  const res = await push(db, cfg, PW, { fetchFn: gh.fetch });
  assert.equal(res.replaced, false);
  const stored = gh.files.get(DEFAULT_FILE).content;
  assert.ok(isLocked(stored));
  assert.ok(!new TextDecoder().decode(stored).includes("올린 회원"));
  assert.match(gh.commits[0], /휴대폰/);
  assert.doesNotMatch(gh.commits[0], /올린 회원/);
  const bytes = await pull(cfg, PW, { fetchFn: gh.fetch });
  assert.deepEqual(listMembers(openLedger(SQL, bytes)).map((m) => m.name), ["올린 회원"]);
});

test("저장소에 더 최신 장부가 있으면 확인 없이는 덮어쓰지 않음", async () => {
  const gh = fakeGitHub();
  await push(fresh({ last_modified: "2026-11-08 15:00:00", last_device: "PC" }), cfg, PW, { fetchFn: gh.fetch });
  const older = fresh({ last_modified: "2026-11-08 09:00:00", last_device: "휴대폰" });
  await assert.rejects(push(older, cfg, PW, { fetchFn: gh.fetch }), RemoteIsNewer);
  assert.equal(gh.commits.length, 1);
  await push(older, cfg, PW, { force: true, fetchFn: gh.fetch });
  assert.equal(gh.commits.length, 2);
  assert.equal(readMeta(gh.files.get(DEFAULT_FILE).content).last_modified, "2026-11-08 09:00:00");
});

test("공개 저장소·틀린 토큰·쓰기 권한 없음·없는 저장소·인터넷 끊김 거부", async () => {
  const gh = fakeGitHub();
  const db = fresh();
  gh.private = false;
  await assert.rejects(push(db, cfg, PW, { fetchFn: gh.fetch }), /공개 저장소/);
  assert.equal(gh.commits.length, 0);
  gh.private = true;
  await assert.rejects(push(db, { ...cfg, token: "x" }, PW, { fetchFn: gh.fetch }), /토큰이 올바르지/);
  await assert.rejects(checkRepo({ ...cfg, repo: "me/other" }, gh.fetch), /찾을 수 없습니다/);
  gh.push = false;
  await assert.rejects(push(db, cfg, PW, { fetchFn: gh.fetch }), /쓰기 권한/);
  await assert.rejects(checkRepo(cfg, async () => { throw new TypeError("fetch failed"); }), /인터넷/);
  assert.equal(await pull(cfg, PW, { fetchFn: fakeGitHub().fetch }), null); // 아직 올린 적 없음
});

test("연결 정보 검사", () => {
  assert.throws(() => makeConfig({ repo: "no-slash", token: "t" }), /아이디\/저장소/);
  assert.throws(() => makeConfig({ repo: "me/data", token: "" }), /토큰/);
  assert.throws(() => makeConfig({ repo: "me/data", token: "t", file: "../x.fmbk" }), /파일 이름/);
  assert.deepEqual(makeConfig({ repo: " me/data ", token: " t " }), { repo: "me/data", file: DEFAULT_FILE, token: "t" });
});

test("올린 장부의 수정 시각·기기는 장부 그대로 (올리기는 '수정'이 아님)", async () => {
  const gh = fakeGitHub();
  const db = fresh({ last_modified: "2026-11-08 10:00:00", last_device: "휴대폰" });
  await push(db, cfg, PW, { fetchFn: gh.fetch });
  assert.equal(getSettings(db).last_modified, "2026-11-08 10:00:00");
});
