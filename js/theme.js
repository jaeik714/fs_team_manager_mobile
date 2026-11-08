// 팀 컬러 (유니폼 색) — PC utils/theme.py 의 TEAMS 와 같은 값 (accent·accent_soft→soft·side→band·side_hover→hover·side_muted→muted·brand). 이름은 '○○ 스타일'로만 쓰고 구단 로고는 쓰지 않는다.
export const TEAMS = {
  red: { label: "레드 (리버풀 스타일)", accent: "#C8102E", soft: "#FDECEE", band: "#8E0C21", brand: "#F6C744", hover: "#A30F27", muted: "#F6D3D8" },
  red_black: { label: "레드·블랙 (맨유 스타일)", accent: "#C81D11", soft: "#FDEDEB", band: "#161616", brand: "#FBE122", hover: "#262626", muted: "#CFCFCF" },
  blue: { label: "블루 (첼시 스타일)", accent: "#034694", soft: "#E8EFF9", band: "#022A5E", brand: "#E8B33A", hover: "#05387A", muted: "#C9D7EC" },
  blaugrana: { label: "블라우그라나 (바르셀로나 스타일)", accent: "#A50044", soft: "#F9E8EF", band: "#004D98", brand: "#EDBB00", hover: "#0A5BAE", muted: "#CFDDF1" },
  sky: { label: "스카이블루 (맨시티 스타일)", accent: "#1B5E9E", soft: "#E7F1FA", band: "#12305C", brand: "#6CABDD", hover: "#1B3F72", muted: "#C9DCF0" },
  yellow_black: { label: "옐로·블랙 (도르트문트 스타일)", accent: "#1F1F1F", soft: "#FFF8CC", band: "#141414", brand: "#FDE100", hover: "#262626", muted: "#D6D6D6" },
  green: { label: "그린 (셀틱 스타일)", accent: "#00703C", soft: "#E6F4EC", band: "#0B4D2E", brand: "#F2F2F2", hover: "#11603A", muted: "#C8E6D4" },
  purple: { label: "퍼플 (피오렌티나 스타일)", accent: "#5B2A86", soft: "#F1EAF8", band: "#3B1A5A", brand: "#FEBE10", hover: "#4A246E", muted: "#DCCDEB" },
  orange: { label: "오렌지 (네덜란드 대표팀 스타일)", accent: "#C2410C", soft: "#FDEEE6", band: "#1F2A44", brand: "#FF8A1F", hover: "#2A3757", muted: "#CBD3E3" },
  navy_red: { label: "네이비·레드 (대한민국 대표팀 스타일)", accent: "#C8102E", soft: "#FDECEE", band: "#0B2A5B", brand: "#FFFFFF", hover: "#143A73", muted: "#C6D3EA" },
};
export const DEFAULT_TEAM = "red";

/** 화면 색을 팀 컬러로 바꾼다 (CSS 변수) */
export function applyTheme(key) {
  const t = TEAMS[key] ?? TEAMS[DEFAULT_TEAM];
  const root = document.documentElement.style;
  root.setProperty("--accent", t.accent);
  root.setProperty("--accent-soft", t.soft);
  root.setProperty("--band", t.band);
  root.setProperty("--gold", t.brand);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.band);
}

/** 공유 이미지용 팔레트 (PC utils/theme.palette 와 같은 값) */
export const BASE = { bg: "#FAFAF9", panel: "#FFFFFF", head: "#F5F5F4", zebra: "#FAF8F7", line: "#E2DFDC", text: "#1C1917",
  muted: "#57534E", white: "#FFFFFF", green: "#15803D", red: "#B91C1C" };
export function palette(key) {
  const t = TEAMS[key] ?? TEAMS[DEFAULT_TEAM];
  return { ...BASE, accent: t.accent, accent_soft: t.soft, side: t.band, side_hover: t.hover, side_muted: t.muted, brand: t.brand };
}
