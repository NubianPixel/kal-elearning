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
  icon TEXT,
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
  image_uri TEXT,
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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS story_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text_st TEXT NOT NULL,
  text_en TEXT,
  audio_st TEXT,
  audio_en TEXT
);

CREATE INDEX IF NOT EXISTS idx_story_lines_story ON story_lines(story_id, position);

CREATE INDEX IF NOT EXISTS idx_vocabulary_language ON vocabulary(language_id);
CREATE INDEX IF NOT EXISTS idx_card_states_due ON card_states(due_date);
CREATE INDEX IF NOT EXISTS idx_review_logs_time ON review_logs(reviewed_at);
`;

/** Starter content: the default language + a few words so the app is
 *  usable immediately; the parent records audio via the admin screen. */
export const DEFAULT_LANGUAGE = { code: 'tn', name: 'Setswana' } as const;

export const SEED_CATEGORIES: Array<{ name: string; icon: string }> = [
  { name: 'Greetings', icon: 'hand-left-outline' },
  { name: 'Family', icon: 'people-outline' },
  { name: 'Animals', icon: 'paw-outline' },
  { name: 'Food', icon: 'nutrition-outline' },
  { name: 'Things', icon: 'cube-outline' },
  { name: 'Words', icon: 'chatbubble-outline' },
];

/** Starter content: the default language + a few words so the app is
 *  usable immediately. `icon` is an Ionicons name used as the starter
 *  illustration (stored as `icon:<name>` in image_uri); parents can
 *  replace these with real photos in the admin screen. */
export const SEED_VOCABULARY: Array<{
  category: string;
  targetText: string;
  translation: string;
  difficulty: 1 | 2 | 3;
  icon?: string;
}> = [
  { category: 'Greetings', targetText: 'Dumela', translation: 'Hello', difficulty: 1, icon: 'hand-left-outline' },
  { category: 'Greetings', targetText: 'Tsamaya sentle', translation: 'Goodbye', difficulty: 2, icon: 'log-out-outline' },
  { category: 'Words', targetText: 'Ee', translation: 'Yes', difficulty: 1, icon: 'checkmark-circle-outline' },
  { category: 'Words', targetText: 'Nnyaa', translation: 'No', difficulty: 1, icon: 'close-circle-outline' },
  { category: 'Food', targetText: 'Metsi', translation: 'Water', difficulty: 1, icon: 'water-outline' },
  { category: 'Food', targetText: 'Dijo', translation: 'Food', difficulty: 1, icon: 'restaurant-outline' },
  { category: 'Things', targetText: 'Buka', translation: 'Book', difficulty: 1, icon: 'book-outline' },
  { category: 'Animals', targetText: 'Ntja', translation: 'Dog', difficulty: 1, icon: 'paw-outline' },
  { category: 'Animals', targetText: 'Katse', translation: 'Cat', difficulty: 1, icon: 'heart-outline' },
  { category: 'Family', targetText: 'Mma', translation: 'Mother', difficulty: 1, icon: 'woman-outline' },
  { category: 'Family', targetText: 'Rra', translation: 'Father', difficulty: 1, icon: 'man-outline' },
  { category: 'Words', targetText: 'Ke a leboga', translation: 'Thank you', difficulty: 2, icon: 'happy-outline' },
];

/** Starter story so Story Time works immediately. The parent records the
 *  per-line audio in the Parent Zone; until then words highlight at a
 *  gentle default reading pace. */
export const SEED_STORY: {
  title: string;
  icon: string;
  lines: Array<{ textSt: string; textEn: string }>;
} = {
  title: 'Ntja le Katse',
  icon: 'paw-outline',
  lines: [
    { textSt: 'Ntja le katse ke diphologolo tsa gae.', textEn: 'The dog and the cat are pets.' },
    { textSt: 'Ntja o bua: Woof, woof!', textEn: 'The dog says: Woof, woof!' },
    { textSt: 'Katse o bua: Meow!', textEn: 'The cat says: Meow!' },
    { textSt: 'Ba ja dijo mmogo.', textEn: 'They eat food together.' },
    { textSt: 'Ba nna mmogo ka lorato.', textEn: 'They live together with love.' },
  ],
};
