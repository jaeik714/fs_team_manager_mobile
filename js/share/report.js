// 월별 회비운영현황 공유 이미지 (PNG 2장: 요약 + 세부내역) — PC utils/share_image.py 의 '휴대폰용' 레이아웃을 Canvas 로 옮긴 것.
// 좌표·크기는 PC 와 같은 1배 값(논리 폭 420)으로 적고 3배로 그린다 → 가로 1260px.
// 글꼴은 저장소에 포함한 줄인 글꼴(fonts/)을 쓰므로 인터넷 없이도 PC 와 같은 모양이 나온다.
import { palette } from "../theme.js";

const SCALE = 3;
const BODY = "FM Pretendard";
const DISPLAY = "FM BlackHanSans";
const FALLBACK = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'; // 줄인 글꼴에 없는 드문 글자

export const CATEGORY_COLORS = { // 분류 칩: [배경, 글자]
  "회비": ["#FEF3C7", "#92400E"], "이자": ["#DBEAFE", "#1E40AF"], "구장 예약": ["#EDE9FE", "#5B21B6"],
  "운영비": ["#FEE2E2", "#991B1B"], "기타": ["#F1F5F4", "#475569"],
};
const M_W = 420, M_PAD = 16, M_IN = M_W - M_PAD * 2;
const M_COLS = [52, M_IN - 52 - 98 - 96, 98, 96]; // 일자 | 내용·비고 | 수입/지출 | 잔액
const M_HEADER_H = 186, M_TILE_H = 66, M_HEAD_H = 30, M_OPEN_H = 36, M_ROW_H = 34, M_DESC_LH = 19, M_MEMO_LH = 16;
const M_TOTAL_H = 122, M_TOTAL_ROW = 34, M_SLIM_H = 70, M_CAT_ROW = 50;

let fontsReady = null;
/** 공유 이미지 글꼴 불러오기 (한 번만) */
export function loadFonts(base = "fonts/") {
  fontsReady ??= (async () => {
    const faces = [new FontFace(BODY, `url(${base}Pretendard-subset.woff2)`, { weight: "45 920" }),
      new FontFace(DISPLAY, `url(${base}BlackHanSans-subset.woff2)`)];
    for (const f of faces) document.fonts.add(await f.load());
  })();
  return fontsReady;
}

const font = (kind, size, weight = 400) =>
  kind === "display" ? `${size * SCALE}px "${DISPLAY}", "${BODY}", ${FALLBACK}` : `${weight} ${size * SCALE}px "${BODY}", ${FALLBACK}`;
const n = (v) => Number(v || 0).toLocaleString("ko-KR");

/** 1배 좌표로 그리면 3배로 변환해 그린다 (PC _Canvas 와 같은 동작) */
class Canvas {
  constructor(width, height, bg) {
    this.el = document.createElement("canvas");
    this.el.width = width * SCALE;
    this.el.height = height * SCALE;
    this.c = this.el.getContext("2d");
    this.c.fillStyle = bg;
    this.c.fillRect(0, 0, this.el.width, this.el.height);
  }
  rect(x, y, w, h, fill, radius = 0, outline = null) {
    const c = this.c;
    c.beginPath();
    c.roundRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE, radius * SCALE);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (outline) {
      c.beginPath();
      c.roundRect((x + 0.5) * SCALE, (y + 0.5) * SCALE, (w - 1) * SCALE, (h - 1) * SCALE, radius * SCALE);
      c.strokeStyle = outline; c.lineWidth = SCALE; c.stroke();
    }
  }
  line(x1, y1, x2, y2, color, width = 1) {
    const c = this.c;
    c.beginPath(); c.moveTo(x1 * SCALE, y1 * SCALE); c.lineTo(x2 * SCALE, y2 * SCALE);
    c.strokeStyle = color; c.lineWidth = width * SCALE; c.stroke();
  }
  textW(text, f) {
    this.c.font = f;
    return this.c.measureText(text).width / SCALE;
  }
  /** 칸보다 길면 말줄임표로 자른다 */
  fit(text, f, maxW) {
    text = String(text);
    if (this.textW(text, f) <= maxW) return text;
    while (text && this.textW(`${text}…`, f) > maxW) text = text.slice(0, -1);
    return `${text}…`;
  }
  /** anchor: "lm"(왼쪽) · "rm"(오른쪽) · "mm"(가운데) — 세로는 모두 가운데 */
  text(x, y, text, f, color, anchor = "lm") {
    const c = this.c;
    c.font = f; c.fillStyle = color; c.textBaseline = "middle";
    c.textAlign = { lm: "left", rm: "right", mm: "center" }[anchor];
    c.fillText(String(text), x * SCALE, y * SCALE);
  }
  png() {
    return new Promise((resolve) => this.el.toBlob(resolve, "image/png"));
  }
}

/** 단어(띄어쓰기) 단위 줄바꿈. 한 단어가 한 줄보다 길 때만 글자 단위로 자른다 */
export function wrapText(cv, text, f, width) {
  const lines = [];
  let cur = "";
  for (const word of String(text).split(" ")) {
    const cand = cur ? `${cur} ${word}` : word;
    if (cv.textW(cand, f) <= width) { cur = cand; continue; }
    if (cur) lines.push(cur);
    cur = "";
    for (const ch of word) {
      if (cv.textW(cur + ch, f) > width && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 분류별 { 수입: [[분류, 건수, 금액]...], 지출: [...] } — 금액 큰 순 */
export function categoryTotals(rows) {
  const agg = new Map();
  for (const t of rows) {
    const [kind, amount] = t.deposit ? ["수입", t.deposit] : ["지출", t.withdrawal];
    const key = `${kind}\u0000${t.category}`;
    const [cnt, total] = agg.get(key) ?? [0, 0];
    agg.set(key, [cnt + 1, total + amount]);
  }
  const out = { 수입: [], 지출: [] };
  for (const [key, [cnt, total]] of agg) {
    const [kind, cat] = key.split("\u0000");
    out[kind].push([cat, cnt, total]);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => b[2] - a[2]);
  return out;
}

const periodLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
const bankLines = (info) => String(info || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 2);
const footer = (cv, C, y, text) => cv.text(M_PAD + M_IN / 2, y, text, font("body", 11, 500), C.muted, "mm");

// ── 1장: 요약 ──
function renderSummary(L, team, bankInfo, generated, C) {
  const cats = categoryTotals(L.rows);
  const secH = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, 52 + Math.max(v.length, 1) * M_CAT_ROW + 8]));
  const height = M_PAD + M_HEADER_H + 12 + M_TILE_H + 14 + secH["수입"] + 12 + secH["지출"] + 12 + 92 + 44 + M_PAD;
  const cv = new Canvas(M_W, height, C.bg);
  const x0 = M_PAD, x1 = M_PAD + M_IN;

  let y = M_PAD; // 머리 띠
  cv.rect(x0, y, M_IN, M_HEADER_H, C.side, 18);
  cv.rect(x0, y + 18, 5, 82, C.brand, 2);
  const teamFont = font("body", 13, 700);
  cv.text(x0 + 20, y + 24, cv.fit(team, teamFont, M_IN - 150), teamFont, C.side_muted);
  cv.text(x1 - 18, y + 24, "1 / 2 · 요약", font("body", 11, 700), C.brand, "rm");
  cv.text(x0 + 20, y + 58, "회비운영현황", font("display", 27), C.white);
  cv.text(x0 + 20, y + 90, periodLabel(L.year_month), font("display", 17), C.brand);
  cv.line(x0 + 20, y + 112, x1 - 20, y + 112, C.side_hover);
  cv.text(x0 + 20, y + 132, "현재 잔액", font("body", 12, 600), C.side_muted);
  cv.text(x0 + 20, y + 162, `${n(L.closing)}원`, font("body", 28, 800), C.white);
  const bankFont = font("body", 12, 500);
  bankLines(bankInfo).forEach((ln, i) => cv.text(x1 - 18, y + 140 + i * 20, cv.fit(ln, bankFont, 170), bankFont, i === 0 ? C.white : C.side_muted, "rm"));

  y += M_HEADER_H + 12; // 이월 · 수입 · 지출
  const tileW = (M_IN - 16) / 3, tileFont = font("body", 16, 800);
  [["전월 이월", `${n(L.opening)}원`, C.text], ["수입", `+${n(L.income)}원`, C.green], ["지출", `−${n(L.expense)}원`, C.red]].forEach(([label, value, color], i) => {
    const tx = x0 + i * (tileW + 8);
    cv.rect(tx, y, tileW, M_TILE_H, C.panel, 12, C.line);
    cv.text(tx + 12, y + 20, label, font("body", 12, 600), C.muted);
    cv.text(tx + 12, y + 46, cv.fit(value, tileFont, tileW - 20), tileFont, color);
  });
  y += M_TILE_H + 14;

  const chipFont = font("body", 12, 700), cntFont = font("body", 13, 500), amtFont = font("body", 16, 800), pctFont = font("body", 12, 600);
  for (const [kind, color, total] of [["수입", C.green, L.income], ["지출", C.red, L.expense]]) { // 분류별 수입 / 지출
    const h = secH[kind];
    cv.rect(x0, y, M_IN, h, C.panel, 14, C.line);
    cv.text(x0 + 16, y + 26, `분류별 ${kind}`, font("body", 16, 800), C.text);
    cv.text(x1 - 16, y + 26, `${kind === "수입" ? "+" : "−"}${n(total)}원`, font("body", 18, 800), color, "rm");
    cv.line(x0 + 16, y + 46, x1 - 16, y + 46, C.line);
    let ry = y + 52;
    if (!cats[kind].length) cv.text(x0 + M_IN / 2, ry + M_CAT_ROW / 2, `이 기간의 ${kind}이 없습니다.`, cntFont, C.muted, "mm");
    for (const [cat, cnt, amount] of cats[kind]) {
      const pct = total ? (amount / total) * 100 : 0;
      const [bg, fg] = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["기타"];
      const cw = cv.textW(cat, chipFont) + 16;
      cv.rect(x0 + 16, ry + 6, cw, 22, bg, 11);
      cv.text(x0 + 16 + cw / 2, ry + 17, cat, chipFont, fg, "mm");
      cv.text(x0 + 16 + cw + 8, ry + 17, `${cnt}건`, cntFont, C.muted);
      const pctText = pct >= 1 ? `${Math.round(pct)}%` : "1% 미만";
      cv.text(x1 - 16, ry + 17, pctText, pctFont, C.muted, "rm");
      cv.text(x1 - 16 - cv.textW(pctText, pctFont) - 10, ry + 17, `${n(amount)}원`, amtFont, C.text, "rm");
      const barW = M_IN - 32;
      cv.rect(x0 + 16, ry + 34, barW, 8, C.head, 4);
      cv.rect(x0 + 16, ry + 34, Math.max((barW * pct) / 100, 6), 8, color, 4);
      ry += M_CAT_ROW;
    }
    y += h + 12;
  }

  const net = L.income - L.expense; // 이번 달 증감 · 잔액
  cv.rect(x0, y, M_IN, 92, C.panel, 14, C.line);
  cv.rect(x0 + 14, y, M_IN - 28, 3, C.accent);
  cv.text(x0 + 16, y + 28, "이번 달 증감", font("body", 14, 600), C.muted);
  cv.text(x1 - 16, y + 28, net >= 0 ? `+${n(net)}원` : `−${n(-net)}원`, font("body", 17, 800), net >= 0 ? C.green : C.red, "rm");
  cv.text(x0 + 16, y + 64, "계", font("display", 18), C.accent);
  cv.text(x1 - 16, y + 64, `${n(L.closing)}원`, font("body", 22, 800), C.text, "rm");
  y += 92;
  footer(cv, C, y + 24, `세부내역은 다음 장 (2 / 2) · Futsal Manager · ${generated}`);
  return cv;
}

// ── 2장: 세부내역 ──
function renderDetail(L, team, generated, C) {
  const f = { desc: font("body", 14, 600), memo: font("body", 12, 400), amount: font("body", 14, 800), bal: font("body", 13, 500),
    date: font("body", 13, 700), chip: font("body", 10, 700), head: font("body", 12, 700) };
  const probe = new Canvas(1, 1, C.bg);
  let prev = null;
  const layout = L.rows.map((t) => { // 거래마다 한 줄 배치 (내용·비고는 잘리지 않게 전부 줄바꿈)
    const chipW = probe.textW(t.category, f.chip) + 10;
    const desc = wrapText(probe, t.description, f.desc, M_COLS[1] - chipW - 16);
    const memo = t.memo ? wrapText(probe, t.memo, f.memo, M_COLS[1] - 10) : [];
    const row = { t, chipW, desc, memo, showDate: t.date !== prev, h: M_ROW_H + (desc.length - 1) * M_DESC_LH + memo.length * M_MEMO_LH };
    prev = t.date;
    return row;
  });
  const listH = M_HEAD_H + M_OPEN_H + layout.reduce((a, r) => a + r.h, 0) + (layout.length ? 0 : 44);
  const height = M_PAD + M_SLIM_H + 12 + listH + 12 + M_TOTAL_H + 40 + M_PAD;
  const cv = new Canvas(M_W, height, C.bg);
  const x0 = M_PAD, x1 = M_PAD + M_IN;

  let y = M_PAD; // 작은 머리 띠
  cv.rect(x0, y, M_IN, M_SLIM_H, C.side, 16);
  cv.text(x0 + 18, y + 22, cv.fit(team, font("body", 12, 700), M_IN - 120), font("body", 12, 700), C.side_muted);
  cv.text(x0 + 18, y + 48, `${periodLabel(L.year_month)} 세부내역`, font("display", 19), C.white);
  cv.text(x1 - 16, y + 35, "2 / 2", font("body", 14, 800), C.brand, "rm");
  y += M_SLIM_H + 12;

  const xs = [x0]; // 표
  for (const w of M_COLS.slice(0, -1)) xs.push(xs.at(-1) + w);
  cv.rect(x0, y, M_IN, listH, C.panel, 12);
  cv.rect(x0, y, M_IN, M_HEAD_H + M_OPEN_H, C.accent_soft, 12);
  cv.rect(x0, y + 12, M_IN, M_HEAD_H + M_OPEN_H - 12, C.accent_soft);
  ["일자", "내용 · 비고", "수입/지출", "잔액"].forEach((label, i) => cv.text(xs[i] + M_COLS[i] / 2, y + M_HEAD_H / 2, label, f.head, C.text, "mm"));
  const oy = y + M_HEAD_H + M_OPEN_H / 2;
  cv.text(x0 + 16, oy, "전월 이월금액", font("body", 15, 700), C.text);
  cv.text(x1 - 16, oy, `${n(L.opening)}원`, font("body", 15, 800), C.text, "rm");
  let cy = y + M_HEAD_H + M_OPEN_H;
  if (!layout.length) cv.text(x0 + M_IN / 2, cy + 22, "이 기간의 거래 내역이 없습니다.", f.memo, C.muted, "mm");
  layout.forEach((r, i) => {
    const { t, h } = r;
    if (i % 2) cv.rect(x0 + 1, cy, M_IN - 2, h, C.zebra);
    if (r.showDate) {
      cv.line(x0, cy, x1, cy, C.line);
      cv.text(xs[0] + 8, cy + 17, `${t.date.slice(5, 7)}.${t.date.slice(8, 10)}`, f.date, C.text);
    }
    const [bg, fg] = CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS["기타"];
    cv.rect(xs[1] + 4, cy + 9, r.chipW, 16, bg, 8);
    cv.text(xs[1] + 4 + r.chipW / 2, cy + 17, t.category, f.chip, fg, "mm");
    r.desc.forEach((ln, k) => cv.text(xs[1] + 4 + r.chipW + 6, cy + 17 + k * M_DESC_LH, ln, f.desc, C.text));
    const memoY = cy + 34 + (r.desc.length - 1) * M_DESC_LH;
    r.memo.forEach((ln, k) => cv.text(xs[1] + 6, memoY + k * M_MEMO_LH, ln, f.memo, C.muted));
    cv.text(xs[3] - 6, cy + 17, t.deposit ? `+${n(t.deposit)}원` : `−${n(t.withdrawal)}원`, f.amount, t.deposit ? C.green : C.red, "rm");
    cv.text(x1 - 8, cy + 17, n(t.balance), f.bal, C.text, "rm");
    cy += h;
  });
  cv.rect(x0, y, M_IN, listH, null, 12, C.line);

  y += listH + 12; // 계
  cv.rect(x0, y, M_IN, M_TOTAL_H, C.panel, 14, C.line);
  cv.rect(x0 + 14, y, M_IN - 28, 3, C.accent);
  [["수입 합계", `${n(L.income)}원`, C.green, false], ["지출 합계", `${n(L.expense)}원`, C.red, false], ["계", `${n(L.closing)}원`, C.text, true]]
    .forEach(([label, value, color, last], i) => {
      const ly = y + 28 + i * M_TOTAL_ROW;
      cv.text(x0 + 16, ly, label, last ? font("display", 16) : font("body", 14, 600), last ? C.accent : C.muted);
      cv.text(x1 - 16, ly, value, font("body", last ? 20 : 16, 800), color, "rm");
    });
  y += M_TOTAL_H;
  footer(cv, C, y + 22, `Futsal Manager · ${generated} 생성`);
  return cv;
}

/**
 * 공유 이미지 2장 만들기. ledger = repo.monthLedger() 결과.
 * 반환: [{ name, blob }] (요약, 세부내역)
 */
export async function shareImages(ledger, { teamName, bankInfo = "", teamColor, generated }) {
  await loadFonts();
  const C = palette(teamColor);
  const sheets = [["요약", renderSummary(ledger, teamName, bankInfo, generated, C)], ["세부내역", renderDetail(ledger, teamName, generated, C)]];
  return Promise.all(sheets.map(async ([name, cv]) => ({ name, blob: await cv.png() })));
}
