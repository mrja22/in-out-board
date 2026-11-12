-- Rebuilt 2026-11-12 from the live D1 schema (the original migration files were lost).
-- The live database already has 0001-0003 applied, so wrangler skips these there;
-- on a fresh database this file creates everything and 0002/0003 do nothing.

CREATE TABLE employees (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  slack_user_id TEXT,
  shift_start   TEXT,
  shift_end     TEXT,
  track         INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'out' CHECK (status IN ('in', 'out')),
  return_time   TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
, work_days TEXT, pto_start TEXT, pto_return TEXT, pto_note TEXT);

CREATE TABLE punches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  TEXT NOT NULL REFERENCES employees(id),
  ts           INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('in', 'out')),
  note         TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL CHECK (source IN ('web', 'slack', 'admin', 'import')),
  actor        TEXT NOT NULL,
  recorded_at  INTEGER NOT NULL,
  voided       INTEGER NOT NULL DEFAULT 0,
  voided_at    INTEGER,
  voided_by    TEXT,
  void_reason  TEXT,
  replaces_id  INTEGER REFERENCES punches(id)
, request_id INTEGER REFERENCES correction_requests(id));

CREATE INDEX punches_emp_ts ON punches (employee_id, ts);

CREATE INDEX punches_ts ON punches (ts);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  before    TEXT,
  after     TEXT,
  reason    TEXT
);

CREATE INDEX audit_at ON audit_log (at);

CREATE TABLE day_notes (
  employee_id TEXT NOT NULL REFERENCES employees(id),
  day         TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('off')),
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (employee_id, day, kind)
);

CREATE TABLE alerts (
  employee_id       TEXT NOT NULL,
  day               TEXT NOT NULL,
  kind              TEXT NOT NULL,
  detail            TEXT NOT NULL DEFAULT '',
  created_at        INTEGER NOT NULL,
  dm_sent_at        INTEGER,
  admin_notified_at INTEGER,
  PRIMARY KEY (employee_id, day, kind)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE correction_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     TEXT NOT NULL REFERENCES employees(id),
  kind            TEXT NOT NULL CHECK (kind IN ('add', 'change', 'remove')),
  punch_id        INTEGER REFERENCES punches(id),
  day             TEXT NOT NULL,
  time            TEXT,
  punch_kind      TEXT CHECK (punch_kind IN ('in', 'out')),
  note            TEXT NOT NULL DEFAULT '',
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by    TEXT NOT NULL,
  requested_via   TEXT NOT NULL CHECK (requested_via IN ('web', 'slack')),
  requested_at    INTEGER NOT NULL,
  decided_by      TEXT,
  decided_at      INTEGER,
  decision_note   TEXT,
  result_punch_id INTEGER,
  slack_channel   TEXT,
  slack_ts        TEXT
);

CREATE INDEX correction_requests_status ON correction_requests (status, requested_at);

CREATE INDEX correction_requests_emp ON correction_requests (employee_id, requested_at);

