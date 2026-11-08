"""PC 쪽: 무작위 작업 목록을 만들고(시드 고정) PC 업무 규칙으로 실행, 결과 표를 JSON 으로 저장."""
import json
import os
import random
import shutil
import sqlite3
import sys

sys.path.insert(0, r"D:\Git\fs_team_manager")
out, seed, start = sys.argv[1], int(sys.argv[2]), sys.argv[3]  # start: empty | sample
rnd = random.Random(seed)

STATUSES = ["납부 완료", "확인 중", "미납", "면제"]
CATS = ["회비", "이자", "구장 예약", "운영비", "기타"]
MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]


def rdate():
    ym = rnd.choice(MONTHS)
    return f"{ym}-{rnd.randint(1, 28):02d}"


def gen_ops(n):
    ops = []
    for _ in range(n):
        k = rnd.choices(["add_member", "update_member", "delete_member", "set_dues", "prepay", "add_tx", "update_tx", "delete_tx"],
                        [8, 4, 1, 30, 5, 10, 5, 4])[0]
        mid = rnd.randint(1, 40)
        if k in ("add_member", "update_member"):
            data = {"name": rnd.choice(["가", "나", "다", "라", " ", "마바"]) + str(rnd.randint(0, 9)),
                    "birth_year": rnd.choice([None, 1990]), "phone": "", "reg_date": rdate(),
                    "back_number": rnd.choice([None, None, rnd.randint(0, 100)]), "status": rnd.choice(["활동", "활동", "휴면"])}
            ops.append({"op": k, "id": mid, "data": data})
        elif k == "delete_member":
            ops.append({"op": k, "id": mid})
        elif k == "set_dues":
            changes = [{"member_id": rnd.randint(1, 40), "year_month": rnd.choice(MONTHS), "status": rnd.choice(STATUSES),
                        "amount": rnd.choice([0, 20000, 30000, 60000]), "paid_date": rnd.choice([rdate(), rdate(), ""])}
                       for _ in range(rnd.randint(1, 4))]
            ops.append({"op": k, "changes": changes})
        elif k == "prepay":
            ops.append({"op": k, "id": mid, "start": rnd.choice(MONTHS), "months": rnd.randint(0, 4),
                        "amount": rnd.choice([20000, 30000]), "paid_date": rnd.choice([rdate(), ""]), "deposit": rnd.random() < .8})
        elif k in ("add_tx", "update_tx"):
            t = {"date": rdate(), "description": rnd.choice(["음료", "구장", "회비", " "]), "type": rnd.choice(["입금", "지출"]),
                 "amount": rnd.choice([0, 5000, 50000]), "category": rnd.choice(CATS + ["없는분류"]), "memo": rnd.choice(["", " 메모 "]),
                 "ledger_month": rnd.choice([None, None, rnd.choice(MONTHS), "2026/9"])}
            ops.append({"op": k, "id": rnd.randint(1, 80), "tx": t})
        else:
            ops.append({"op": k, "id": rnd.randint(1, 80)})
    return ops


def apply(db, op):
    k = op["op"]
    if k == "add_member":
        db.add_member(op["data"])
    elif k == "update_member":
        db.update_member(op["id"], op["data"])
    elif k == "delete_member":
        db.delete_member(op["id"])
    elif k == "set_dues":
        db.set_dues(op["changes"])
    elif k == "prepay":
        db.record_prepayment(op["id"], op["start"], op["months"], op["amount"], op["paid_date"], op["deposit"])
    elif k == "add_tx":
        t = op["tx"]
        db.add_transaction(t["date"], t["description"], t["type"], t["amount"], t["category"], t["memo"], t["ledger_month"])
    elif k == "update_tx":
        t = op["tx"]
        db.update_transaction(op["id"], t["date"], t["description"], t["type"], t["amount"], t["category"], t["memo"], t["ledger_month"])
    elif k == "delete_tx":
        db.delete_transaction(op["id"])


def dump(path):
    c = sqlite3.connect(path)
    res = {}
    for t in ("members", "dues", "transactions"):
        res[t] = [list(r) for r in c.execute(f"SELECT * FROM {t} ORDER BY id")]
    res["settings"] = sorted([list(r) for r in c.execute("SELECT key, value FROM settings WHERE key NOT IN ('last_modified', 'last_device')")])
    c.close()
    return res


start_path = os.path.join(out, f"start_{start}.db")
work = os.path.join(out, "work_pc.db")
if not os.path.exists(start_path):
    os.environ["FUTSAL_DB_PATH"] = start_path
    from data import db as _db
    _db.init_db(seed_sample=(start == "sample"))
shutil.copy(start_path, work)
os.environ["FUTSAL_DB_PATH"] = work
import importlib  # noqa: E402

from data import db  # noqa: E402
importlib.reload(db)

ops = gen_ops(300)
outcomes = []
for op in ops:
    try:
        apply(db, op)
        outcomes.append("ok")
    except Exception as e:  # noqa: BLE001 — 규칙 위반·외래키 위반 모두 '실패'로 비교
        outcomes.append("err")
json.dump({"ops": ops, "outcomes": outcomes, "tables": dump(work)}, open(os.path.join(out, "pc_result.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"seed {seed} {start}: ok {outcomes.count('ok')} / err {outcomes.count('err')}")
