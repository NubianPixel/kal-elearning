/**
 * SQLite schema for the A1 learning engine's progress database
 * (`kal-a1.db`). Separate from the legacy `kal-elearning.db` — the A1
 * redesign is a fresh start with no migration (see design doc). No audio
 * or file paths are ever stored here.
 */

export const A1_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS card_states (
  item_id TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('listen', 'recall', 'drill')),
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  last_reviewed_at TEXT,
  introduced_at TEXT,
  PRIMARY KEY (item_id, card_type)
);

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('listen', 'recall', 'drill')),
  reviewed_at TEXT NOT NULL,
  quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5),
  time_spent_ms INTEGER
);

CREATE TABLE IF NOT EXISTS unit_steps (
  unit INTEGER NOT NULL,
  step TEXT NOT NULL CHECK (step IN ('words', 'grammar', 'useit', 'checkpoint')),
  completed_at TEXT NOT NULL,
  PRIMARY KEY (unit, step)
);

-- unit is NULL for the A1 exit test.
CREATE TABLE IF NOT EXISTS checkpoint_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit INTEGER,
  overall REAL NOT NULL,
  per_skill_json TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  attempted_at TEXT NOT NULL
);

-- PRIVACY: self-rating only, no audio, no paths.
CREATE TABLE IF NOT EXISTS speaking_ratings (
  item_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('nailed', 'close', 'again')),
  rated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_days (
  day TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_states_due ON card_states(due_date);
CREATE INDEX IF NOT EXISTS idx_review_logs_item ON review_logs(item_id, card_type, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_speaking_ratings_item ON speaking_ratings(item_id, rated_at);
CREATE INDEX IF NOT EXISTS idx_checkpoint_attempts_unit ON checkpoint_attempts(unit, attempted_at);
`;
