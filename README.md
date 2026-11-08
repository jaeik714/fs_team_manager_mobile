# Futsal Manager Mobile

풋살팀 총무용 **휴대폰 단독 실행 웹앱(PWA)**. PC 버전([fs_team_manager](../fs_team_manager))과 **같은 SQLite 장부 파일**을 쓰며, 백업 파일(.db)을 주고받아 장부를 맞춘다.

- 설치: GitHub Pages 주소를 휴대폰 크롬/삼성 인터넷에서 열고 "홈 화면에 추가" → 이후 인터넷 없이 동작
- 데이터: 휴대폰 브라우저 저장소(IndexedDB)에만 저장. 서버·git 에 올라가지 않음
- 명세: PC 저장소의 `FutsalManager_모바일버전_개발명세.md`

## 디렉토리 구조

```
fs_team_manager_mobile/
├── index.html              # 앱 첫 화면(한 페이지 앱의 뼈대)
├── manifest.webmanifest    # 홈 화면 아이콘·이름·전체 화면 설정 (PWA)
├── sw.js                   # Service Worker: 앱 파일을 캐시해 오프라인 실행
├── css/                    # 화면 스타일 (휴대폰 폭 360~412px 기준, 팀 컬러)
├── js/
│   ├── app.js              # 시작점: sql.js 로드 → 장부 열기 → 화면 전환, 불러오기·백업 보내기
│   ├── state.js            # 공통 상태(열린 장부)·저장(persist)·화면 도우미
│   ├── db/
│   │   ├── schema.js       # DB 구조 (PC data/db.py 와 동일, SCHEMA_VERSION)
│   │   ├── storage.js      # 장부 파일을 IndexedDB 에 저장·불러오기
│   │   ├── repo.js         # 읽기: 검사·요약·회비 현황·거래·잔액 (PC data/db.py 조회)
│   │   ├── write.js        # 쓰기: 회비↔통장 연동·검사·수정 시각 기록 (PC data/db.py 쓰기)
│   │   └── backup.js       # 백업 보내기(공유 창/다운로드)·7일 알림 판단
│   ├── views/              # 화면: home(대시보드)·backup / 다음: 회비 체크·거래 등록·공유
│   └── share/              # 공유 이미지(Canvas) — PC utils/share_image.py 대응
├── vendor/sql.js/          # SQLite(WebAssembly) — 오프라인용으로 저장소에 포함 (MIT)
├── fonts/                  # 공유 이미지용 한글 글꼴(2,350자로 줄인 파일)
├── icons/                  # 홈 화면 아이콘 (192·512px)
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
