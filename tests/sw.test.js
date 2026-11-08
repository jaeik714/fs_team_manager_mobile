// 인터넷 없이 열기: Service Worker 가 저장하는 파일 목록(FILES)이 실제 앱 파일과 맞는지
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sw = readFileSync(join(root, "sw.js"), "utf8");
const files = JSON.parse(`[${sw.match(/const FILES = \[([\s\S]*?)\];/)[1].replace(/,\s*$/, "")}]`);
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => (statSync(join(root, dir, f)).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]));

test("저장 목록의 파일이 모두 있음", () => {
  for (const f of files.filter((f) => f !== "./")) assert.ok(existsSync(join(root, f)), `없는 파일: ${f}`);
});

test("앱이 쓰는 파일이 저장 목록에 모두 들어 있음 (빠지면 인터넷 없을 때 그 화면이 안 열림)", () => {
  const needed = [...walk("js"), ...walk("css"), ...walk("icons"), "index.html", "manifest.webmanifest",
    ...walk("fonts").filter((f) => f.endsWith(".woff2")), ...walk("vendor").filter((f) => /\.(js|wasm)$/.test(f))];
  for (const f of needed) assert.ok(files.includes(f), `저장 목록에 없음: ${f}`);
});

test("index.html·화면 코드가 부르는 파일도 목록에 있음", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) assert.ok(files.includes(ref), `index.html 이 부르는 ${ref}`);
  const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons) assert.ok(files.includes(icon.src), `manifest 아이콘 ${icon.src}`);
});

test("버전 표시가 CHANGELOG 최신 버전과 같음 (올릴 때 VERSION 을 꼭 바꾸도록)", () => {
  const version = sw.match(/const VERSION = "([^"]+)"/)[1];
  const latest = readFileSync(join(root, "CHANGELOG.md"), "utf8").match(/## \[([^\]]+)\]/)[1];
  assert.equal(version, latest);
});
