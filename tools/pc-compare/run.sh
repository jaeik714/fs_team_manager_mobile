#!/usr/bin/env bash
# PC ↔ 휴대폰 업무 규칙 무작위 비교. PC 저장소(D:\Git\fs_team_manager)의 가상환경이 필요하다.
# 같은 작업 목록을 양쪽 규칙으로 실행해 작업별 성공/실패와 최종 표를 비교한다. 실제 장부는 쓰지 않는다.
# 사용: bash tools/pc-compare/run.sh   (PC 의 data/db.py 를 고친 뒤 꼭 실행)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
PY=/d/Git/fs_team_manager/.venv/Scripts/python
for start in empty sample; do
  for seed in 1 2 3; do
    "$PY" "$HERE/pc_ops.py" "$WORK" "$seed" "$start"
    node "$HERE/js_ops.mjs" "$WORK" "$start"
  done
done
rm -rf "$WORK"
echo "모두 일치"
