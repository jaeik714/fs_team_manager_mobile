// DB 구조 — PC 버전(fs_team_manager/data/db.py 의 SCHEMA)과 반드시 같아야 한다.
// PC 에서 구조를 바꾸면 SCHEMA_VERSION 을 올리고 이 파일도 같이 고친다.
export const SCHEMA_VERSION = 1;
export const DEVICE = "휴대폰"; // PC 버전은 "PC"
export const META_KEYS = ["schema_version", "last_modified", "last_device"];

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    birth_year  INTEGER,
    phone       TEXT,
    reg_date    TEXT    NOT NULL,
    back_number INTEGER CHECK (back_number BETWEEN 1 AND 99),
    status      TEXT    NOT NULL CHECK (status IN ('활동', '휴면'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_members_back_number
    ON members(back_number) WHERE back_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS dues (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    year_month TEXT    NOT NULL,
    amount     INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
    status     TEXT    NOT NULL CHECK (status IN ('납부 완료', '확인 중', '미납', '면제')),
    paid_date  TEXT,
    tx_id      INTEGER REFERENCES transactions(id) ON DELETE SET NULL,  -- 연결된 모임통장 입금
    UNIQUE (member_id, year_month)
);

CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT    NOT NULL,
    description TEXT    NOT NULL CHECK (length(trim(description)) > 0),
    deposit     INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
    withdrawal  INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal >= 0),
    category    TEXT    NOT NULL DEFAULT '기타',
    memo        TEXT    NOT NULL DEFAULT '',
    ledger_month TEXT,
    CHECK ((deposit > 0) <> (withdrawal > 0))
);
CREATE INDEX IF NOT EXISTS ix_transactions_date ON transactions(date, id);
`;
