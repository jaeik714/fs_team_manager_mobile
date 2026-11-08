// 백업 내보내기 · 7일 백업 알림.
// 휴대폰이 사실상 유일한 장부 보관 장소이므로, 휴대폰에서 고친 내용이 7일 넘게 밖으로 나가지 않았으면 알린다.
import { nowStamp } from "./repo.js";

export const REMIND_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/** 파일 이름에 쓸 수 없는 글자 제거 (PC utils/excel_generator.safe_filename 과 같은 목적) */
export function safeFileName(name) {
  return String(name ?? "").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "FutsalManager";
}

const pad = (n) => String(n).padStart(2, "0");
export function backupFileName(teamName, now = new Date()) {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${safeFileName(teamName)}_휴대폰백업_${stamp}.db`;
}

/**
 * 백업 알림 판단.
 * - unsaved: 마지막 백업 이후 휴대폰에서 고친 내용이 있는가 (장부의 last_device=휴대폰 이고 last_modified 가 백업보다 뒤)
 * - due: unsaved 이고 마지막 백업 후 REMIND_DAYS 일이 지났는가 (백업한 적이 없으면 unsaved 만으로 due)
 * @param {{lastBackupAt?: string, lastModified?: string, lastDevice?: string, now?: Date}} p  lastBackupAt 은 ISO 시각
 */
export function backupStatus({ lastBackupAt = null, lastModified = "", lastDevice = "", now = new Date() }) {
  const backedAt = lastBackupAt ? new Date(lastBackupAt) : null;
  const unsaved = lastDevice === "휴대폰" && !!lastModified && (!backedAt || lastModified > nowStamp(backedAt));
  const days = backedAt ? Math.floor((now - backedAt) / DAY) : null;
  const due = unsaved && (days === null || days >= REMIND_DAYS);
  let message = "";
  if (due) {
    message = days === null
      ? "휴대폰에서 기록한 내용을 아직 백업하지 않았습니다. 백업 파일을 카카오톡 '나와의 채팅' 등으로 보내 두세요."
      : `마지막 백업 후 ${days}일이 지났습니다. 그 사이 기록한 내용이 있으니 백업 파일을 보내 두세요.`;
  }
  return { unsaved, days, due, message };
}

/**
 * 백업 파일 보내기. 휴대폰 공유 창(카카오톡 등)이 파일을 받을 수 있으면 공유, 아니면 다운로드 폴더에 저장.
 * (안드로이드 크롬은 공유할 수 있는 파일 종류가 정해져 있어 .db 는 막힐 수 있음 → 다운로드로 대신)
 * 반환: "share" | "download" | "cancel"
 */
export async function sendBackup(bytes, fileName, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
  const file = new File([bytes], fileName, { type: "application/octet-stream" });
  if (nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: fileName });
      return "share";
    } catch (e) {
      if (e?.name === "AbortError") return "cancel"; // 공유 창에서 취소
      // 그 밖의 공유 실패는 다운로드로 대신
    }
  }
  const url = URL.createObjectURL(file);
  const a = doc.createElement("a");
  a.href = url;
  a.download = fileName;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "download";
}
