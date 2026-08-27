/**
 * SQLite schema. `language` is a first-class entity: every content table
 * references it, so a new language is added by inserting a row — no
 * schema or review-engine changes required.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  UNIQUE(language_id, name)
);

CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  target_text TEXT NOT NULL,
  translation TEXT NOT NULL,
  notes TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty IN (1, 2, 3)),
  audio_uri TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS card_states (
  vocabulary_id INTEGER PRIMARY KEY REFERENCES vocabulary(id) ON DELETE CASCADE,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  last_reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS review_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL,
  quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5),
  time_spent_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_language ON vocabulary(language_id);
CREATE INDEX IF NOT EXISTS idx_card_states_due ON card_states(due_date);
CREATE INDEX IF NOT EXISTS idx_review_logs_time ON review_logs(reviewed_at);
`;

/** Starter content: the default language + a few words so the app is
 *  usable immediately; the parent records audio via the admin screen. */
export const DEFAULT_LANGUAGE = { code: 'tn', name: 'Setswana' } as const;

export const SEED_CATEGORIES: Array<{ name: string; emoji: string }> = [
  { name: 'Greetings', emoji: '👋' },
  { name: 'Family', emoji: '👨‍👩‍👦' },
  { name: 'Animals', emoji: '🐶' },
  { name: 'Food', emoji: '🍎' },
  { name: 'Things', emoji: '📦' },
  { name: 'Words', emoji: '💬' },
];

export const SEED_VOCABULARY: Array<{
  category: string;
  targetText: string;
  translation: string;
  difficulty: 1 | 2 | 3;
}> = [
  { category: 'Greetings', targetText: 'Dumela', translation: 'Hello', difficulty: 1 },
  { category: 'Greetings', targetText: 'Tsamaya sentle', translation: 'Goodbye', difficulty: 2 },
  { category: 'Words', targetText: 'Ee', translation: 'Yes', difficulty: 1 },
  { category: 'Words', targetText: 'Nnyaa', translation: 'No', difficulty: 1 },
  { category: 'Food', targetText: 'Metsi', translation: 'Water', difficulty: 1 },
  { category: 'Food', targetText: 'Dijo', translation: 'Food', difficulty: 1 },
  { category: 'Things', targetText: 'Buka', translation: 'Book', difficulty: 1 },
  { category: 'Animals', targetText: 'Ntja', translation: 'Dog', difficulty: 1 },
  { category: 'Animals', targetText: 'Katse', translation: 'Cat', difficulty: 1 },
  { category: 'Family', targetText: 'Mma', translation: 'Mother', difficulty: 1 },
  { category: 'Family', targetText: 'Rra', translation: 'Father', difficulty: 1 },
  { category: 'Words', targetText: 'Ke a leboga', translation: 'Thank you', difficulty: 2 },
];
