PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 recovery_hash TEXT NOT NULL, created_at TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS curriculum_units (
 id TEXT PRIMARY KEY, level TEXT NOT NULL, title_zh TEXT NOT NULL, order_no INTEGER NOT NULL, predecessor TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS content_versions (
 content_id TEXT NOT NULL, version TEXT NOT NULL, sha256 TEXT NOT NULL, imported_at TEXT NOT NULL,
 PRIMARY KEY(content_id,version)
) STRICT;
CREATE TABLE IF NOT EXISTS lessons (
 id TEXT NOT NULL, version TEXT NOT NULL, kind TEXT NOT NULL, level TEXT NOT NULL, unit_id TEXT,
 title_zh TEXT NOT NULL, order_no INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
 payload TEXT NOT NULL, PRIMARY KEY(id,version),
 FOREIGN KEY(id,version) REFERENCES content_versions(content_id,version)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_content ON lessons(id) WHERE active=1;
CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, title_zh TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS lesson_skill_links (
 lesson_id TEXT NOT NULL, version TEXT NOT NULL, skill_id TEXT NOT NULL REFERENCES skills(id),
 PRIMARY KEY(lesson_id,version,skill_id), FOREIGN KEY(lesson_id,version) REFERENCES lessons(id,version)
) STRICT;
CREATE TABLE IF NOT EXISTS exercises (
 id TEXT NOT NULL, version TEXT NOT NULL, lesson_id TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(id,version), FOREIGN KEY(lesson_id,version) REFERENCES lessons(id,version)
) STRICT;
CREATE TABLE IF NOT EXISTS attempt_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
 device_id TEXT NOT NULL, kind TEXT NOT NULL, lesson_id TEXT NOT NULL, exercise_id TEXT,
 content_version TEXT NOT NULL, skill_ids TEXT NOT NULL, answer TEXT NOT NULL, feedback TEXT NOT NULL,
 scoring_basis TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, payload_hash TEXT NOT NULL,
 payload TEXT NOT NULL, UNIQUE(user_id,event_id), FOREIGN KEY(lesson_id,content_version) REFERENCES lessons(id,version)
) STRICT;
CREATE INDEX IF NOT EXISTS attempts_user_time ON attempt_events(user_id,occurred_at,event_id);
CREATE TABLE IF NOT EXISTS mastery_evidence (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), event_id TEXT NOT NULL,
 skill_id TEXT NOT NULL, knowledge_point TEXT NOT NULL, score INTEGER, independent INTEGER NOT NULL,
 error_category TEXT, occurred_at TEXT NOT NULL, evidence_type TEXT NOT NULL,
 FOREIGN KEY(user_id,event_id) REFERENCES attempt_events(user_id,event_id)
) STRICT;
CREATE INDEX IF NOT EXISTS evidence_skill ON mastery_evidence(user_id,skill_id,knowledge_point,occurred_at);
CREATE TABLE IF NOT EXISTS review_queue (
 user_id TEXT NOT NULL REFERENCES users(id), skill_id TEXT NOT NULL, knowledge_point TEXT NOT NULL,
 lesson_id TEXT NOT NULL, due_at TEXT NOT NULL, interval_days REAL NOT NULL, repetitions INTEGER NOT NULL,
 last_event_id TEXT NOT NULL, PRIMARY KEY(user_id,skill_id,knowledge_point)
) STRICT;
CREATE TABLE IF NOT EXISTS recordings (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), event_id TEXT NOT NULL,
 lesson_id TEXT NOT NULL, content_version TEXT NOT NULL, relative_path TEXT NOT NULL,
 mime TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(user_id,event_id), FOREIGN KEY(user_id,event_id) REFERENCES attempt_events(user_id,event_id)
) STRICT;
CREATE TABLE IF NOT EXISTS notes (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), lesson_id TEXT NOT NULL,
 text TEXT NOT NULL, created_at TEXT NOT NULL, event_id TEXT NOT NULL,
 FOREIGN KEY(user_id,event_id) REFERENCES attempt_events(user_id,event_id)
) STRICT;
CREATE TABLE IF NOT EXISTS sync_cursors (
 user_id TEXT NOT NULL REFERENCES users(id), device_id TEXT NOT NULL, last_seq INTEGER NOT NULL,
 updated_at TEXT NOT NULL, PRIMARY KEY(user_id,device_id)
) STRICT;
CREATE TABLE IF NOT EXISTS ai_usage (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 input_tokens INTEGER, output_tokens INTEGER, estimated_cost REAL, model TEXT NOT NULL, status TEXT NOT NULL
) STRICT;
