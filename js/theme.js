// 팀 컬러 (유니폼 색) — PC utils/theme.py 의 TEAMS 와 같은 값. 이름은 '○○ 스타일'로만 쓰고 구단 로고는 쓰지 않는다.
export const TEAMS = {
  red: { label: "레드 (리버풀 스타일)", accent: "#C8102E", soft: "#FDECEE", band: "#8E0C21", brand: "#F6C744" },
  red_black: { label: "레드·블랙 (맨유 스타일)", accent: "#C81D11", soft: "#FDEDEB", band: "#161616", brand: "#FBE122" },
  blue: { label: "블루 (첼시 스타일)", accent: "#034694", soft: "#E8EFF9", band: "#022A5E", brand: "#E8B33A" },
  blaugrana: { label: "블라우그라나 (바르셀로나 스타일)", accent: "#A50044", soft: "#F9E8EF", band: "#004D98", brand: "#EDBB00" },
  sky: { label: "스카이블루 (맨시티 스타일)", accent: "#1B5E9E", soft: "#E7F1FA", band: "#12305C", brand: "#6CABDD" },
  yellow_black: { label: "옐로·블랙 (도르트문트 스타일)", accent: "#1F1F1F", soft: "#FFF8CC", band: "#141414", brand: "#FDE100" },
  green: { label: "그린 (셀틱 스타일)", accent: "#00703C", soft: "#E6F4EC", band: "#0B4D2E", brand: "#F2F2F2" },
  purple: { label: "퍼플 (피오렌티나 스타일)", accent: "#5B2A86", soft: "#F1EAF8", band: "#3B1A5A", brand: "#FEBE10" },
  orange: { label: "오렌지 (네덜란드 대표팀 스타일)", accent: "#C2410C", soft: "#FDEEE6", band: "#1F2A44", brand: "#FF8A1F" },
  navy_red: { label: "네이비·레드 (대한민국 대표팀 스타일)", accent: "#C8102E", soft: "#FDECEE", band: "#0B2A5B", brand: "#FFFFFF" },
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
