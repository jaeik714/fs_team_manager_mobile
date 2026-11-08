# Futsal Manager Mobile

풋살팀 총무용 **휴대폰 단독 실행 웹앱(PWA)**. PC 버전([fs_team_manager](../fs_team_manager))과 **같은 SQLite 장부 파일**을 쓰며, 백업 파일(.db)을 주고받아 장부를 맞춘다.

- 설치: GitHub Pages 주소를 휴대폰 크롬/삼성 인터넷에서 열고 "홈 화면에 추가" → 이후 인터넷 없이 동작
- 새 휴대폰에서 시작: 첫 화면 **[GitHub 에서 받아오기]**에 저장소·토큰·백업 비밀번호를 넣으면 바로 장부를 받아옴 (또는 PC 백업 .db 파일 불러오기)
- 데이터: 휴대폰 브라우저 저장소(IndexedDB). PC 와 주고받을 때는 **백업 비밀번호로 잠근 파일만** 내 GitHub **비공개** 저장소에 올림 (이 공개 저장소에는 절대 올리지 않음)
- 명세: PC 저장소의 `FutsalManager_모바일버전_개발명세.md`

## 디렉토리 구조

```
fs_team_manager_mobile/
├── index.html              # 앱 첫 화면(한 페이지 앱의 뼈대)
├── manifest.webmanifest    # 홈 화면 아이콘·이름·전체 화면 설정 (PWA)
├── sw.js                   # Service Worker: 앱 파일 전체를 저장해 인터넷 없이 열기. 올릴 때 VERSION 변경(CHANGELOG 와 같게)
├── css/                    # 화면 스타일 (휴대폰 폭 360~412px 기준, 팀 컬러)
├── js/
│   ├── app.js              # 시작점: sql.js 로드 → 장부 열기 → 화면 전환, 불러오기·백업 보내기
│   ├── state.js            # 공통 상태(열린 장부)·저장(persist)·화면 도우미
│   ├── ui.js               # 입력 창(시트)·월 이동·선택 단추
│   ├── theme.js            # 팀 컬러 10종 (PC utils/theme.py 와 같은 값)
│   ├── db/
│   │   ├── schema.js       # DB 구조 (PC data/db.py 와 동일, SCHEMA_VERSION)
│   │   ├── storage.js      # 장부 파일을 IndexedDB 에 저장·불러오기
│   │   ├── repo.js         # 읽기: 검사·요약·회비 현황·거래·잔액 (PC data/db.py 조회)
│   │   ├── write.js        # 쓰기: 회비↔통장 연동·검사·수정 시각 기록 (PC data/db.py 쓰기)
│   │   ├── backup.js       # 파일로 보내기(공유 창/다운로드)·7일 알림 판단
│   │   ├── secure.js       # 백업 비밀번호로 잠근 파일(.fmbk) — PC data/secure_backup.py 와 같은 형식
│   │   └── cloud.js        # GitHub 비공개 저장소 올리기·받아오기 — PC data/cloud_sync.py 대응
│   ├── views/              # 화면: home·dues(회비)·bank(통장)·members(회원)·backup(+settings 팀 설정)
│   └── share/report.js     # 회비운영현황 공유 이미지 2장(Canvas) — PC utils/share_image.py 휴대폰용과 같은 디자인
├── vendor/sql.js/          # SQLite(WebAssembly) — 오프라인용으로 저장소에 포함 (MIT)
├── fonts/                  # 공유 이미지용 글꼴 — Pretendard 2,350자(433KB)·Black Han Sans 제목 글자(6KB), OFL 라이선스
├── icons/                  # 홈 화면 아이콘 (192·512·maskable·apple-touch·favicon)
├── tests/                  # node --test (npm test): PC 테스트와 같은 사례로 업무 규칙 검증
├── tools/pc-compare/       # PC ↔ 휴대폰 업무 규칙 무작위 비교 (PC 규칙을 고친 뒤 실행)
├── package.json            # 테스트·로컬 서버 명령 (설치할 패키지 없음)
└── docs/devlog/            # 날짜별 개발 일지
```

## 개발 (PC에서 휴대폰 화면으로 보기)

```powershell
cd D:\Git\fs_team_manager_mobile
python -m http.server 8000
```
크롬 `http://localhost:8000` → `F12` → `Ctrl+Shift+M` (Galaxy 기기 선택 또는 폭 360·412px)

## PC 버전과의 약속
- `settings` 표의 `schema_version` · `last_modified`(`YYYY-MM-DD HH:MM:SS`) · `last_device`(`PC`/`휴대폰`)
- 내 버전보다 큰 `schema_version` 파일은 열지 않는다. 불러올 파일이 더 오래됐으면 경고 + 추가 확인

## 새 버전 올리는 순서
1. `CHANGELOG.md` 맨 위에 새 버전 기록, `sw.js` 의 `VERSION` 을 같은 값으로 (다르면 `npm test` 실패)
2. 새 파일을 만들었으면 `sw.js` 의 `FILES` 에 추가 (빠지면 `npm test` 실패 — 인터넷 없을 때 그 파일이 안 열림)
3. `npm test` 통과 → 커밋 → push. 휴대폰은 다음에 열 때 새 버전을 받아 두고 **[새 버전 적용]** 알림
