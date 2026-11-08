// 회비운영현황 공유: 이미지 2장(요약·세부내역)을 만들어 미리 보고, 휴대폰 공유 창으로 카카오톡 등에 한 번에 보낸다.
// 사진(PNG)은 공유 창이 받으므로 카톡 대화방을 바로 고를 수 있다. 공유가 안 되는 브라우저는 사진으로 저장.
import { safeFileName } from "../db/backup.js";
import { getSettings, monthLedger } from "../db/repo.js";
import { shareImages } from "../share/report.js";
import { state, toast } from "../state.js";
import { monthLabel, openSheet, today } from "../ui.js";

export async function openShare(ym) {
  const s = getSettings(state.db);
  toast("이미지를 만드는 중…");
  const images = await shareImages(monthLedger(state.db, ym), { teamName: s.team_name, bankInfo: s.bank_info, teamColor: s.team_color, generated: today() });
  const base = `${safeFileName(s.team_name)}_회비운영현황_${ym}`;
  const files = images.map((img, i) => new File([img.blob], `${base}_${i + 1}${img.name}.png`, { type: "image/png" }));
  const urls = images.map((img) => URL.createObjectURL(img.blob));
  const canShare = !!navigator.canShare?.({ files });
  try {
    await openSheet({
      title: `${monthLabel(ym)} 회비운영현황`,
      submitLabel: canShare ? "카톡 등으로 보내기" : "사진으로 저장",
      body: `
        <p class="muted small">${canShare ? "보내기를 누르면 공유 창이 열립니다. <b>카카오톡</b> → 대화방을 고르면 2장이 함께 전송됩니다." : "이 브라우저는 공유 창을 지원하지 않아 사진으로 저장합니다."}</p>
        <div class="previews">${images.map((img, i) => `<figure><img src="${urls[i]}" alt="${img.name}"><figcaption>${i + 1} / 2 · ${img.name}</figcaption></figure>`).join("")}</div>`,
      onSubmit: async () => {
        if (canShare) {
          try {
            await navigator.share({ files, title: `${monthLabel(ym)} 회비운영현황` });
            toast("보냈습니다.");
          } catch (e) {
            if (e?.name === "AbortError") throw new Error("보내기를 취소했습니다. 다시 누르면 공유 창이 열립니다.");
            throw e;
          }
        } else {
          files.forEach((f, i) => {
            const a = document.createElement("a");
            a.href = urls[i];
            a.download = f.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
          });
          toast("사진 2장을 저장했습니다. (다운로드 폴더)");
        }
      },
    });
  } finally {
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60_000);
  }
}
