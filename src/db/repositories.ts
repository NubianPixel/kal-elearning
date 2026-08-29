/**
 * Data-access layer. Every query is language-scoped so the review engine
 * and UI work identically for any language the parent adds later.
 */

import type * as SQLite from 'expo-sqlite';
import { schedule, qualityFromAnswer, type Sm2State } from '../core/sm2';
import { computeStreak } from '../core/progress';
import type {
  CardState,
  Category,
  Difficulty,
  Language,
  ProgressStats,
  VocabularyEntry,
} from '../core/types';

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export async function listLanguages(db: SQLite.SQLiteDatabase): Promise<Language[]> {
  return db.getAllAsync<Language>('SELECT id, code, name FROM languages ORDER BY name');
}

export async function createLanguage(
  db: SQLite.SQLiteDatabase,
  code: string,
  name: string,
): Promise<Language> {
  const res = await db.runAsync('INSERT INTO languages (code, name) VALUES (?, ?)', [code, name]);
  return { id: res.lastInsertRowId, code, name };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(
  db: SQLite.SQLiteDatabase,
  languageId: number,
): Promise<Category[]> {
  return db.getAllAsync<Category>(
    'SELECT id, language_id AS languageId, name, icon FROM categories WHERE language_id = ? ORDER BY name',
    [languageId],
  );
}

export async function createCategory(
  db: SQLite.SQLiteDatabase,
  languageId: number,
  name: string,
  icon: string | null,
): Promise<Category> {
  const res = await db.runAsync(
    'INSERT INTO categories (language_id, name, icon) VALUES (?, ?, ?)',
    [languageId, name, icon],
  );
  return { id: res.lastInsertRowId, languageId, name, icon };
}

// ---------------------------------------------------------------------------
// Vocabulary (admin CRUD)
// ---------------------------------------------------------------------------

export interface VocabularyInput {
  languageId: number;
  categoryId: number | null;
  targetText: string;
  translation: string;
  notes?: string | null;
  difficulty: Difficulty;
  audioUri?: string | null;
  imageUri?: string | null;
}

export async function listVocabulary(
  db: SQLite.SQLiteDatabase,
  languageId: number,
): Promise<VocabularyEntry[]> {
  return db.getAllAsync<VocabularyEntry>(
    `SELECT id, language_id AS languageId, category_id AS categoryId,
            target_text AS targetText, translation, notes, difficulty, audio_uri AS audioUri, image_uri AS imageUri
     FROM vocabulary WHERE language_id = ? ORDER BY category_id, target_text`,
    [languageId],
  );
}

export async function createVocabulary(
  db: SQLite.SQLiteDatabase,
  input: VocabularyInput,
): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO vocabulary (language_id, category_id, target_text, translation, notes, difficulty, audio_uri, image_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.languageId,
      input.categoryId,
      input.targetText.trim(),
      input.translation.trim(),
      input.notes ?? null,
      input.difficulty,
      input.audioUri ?? null,
      input.imageUri ?? null,
    ],
  );
  return res.lastInsertRowId;
}

export async function updateVocabulary(
  db: SQLite.SQLiteDatabase,
  id: number,
  input: VocabularyInput,
): Promise<void> {
  await db.runAsync(
    `UPDATE vocabulary SET category_id = ?, target_text = ?, translation = ?,
       notes = ?, difficulty = ?, audio_uri = ?, image_uri = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
    [
      input.categoryId,
      input.targetText.trim(),
      input.translation.trim(),
      input.notes ?? null,
      input.difficulty,
      input.audioUri ?? null,
      input.imageUri ?? null,
      id,
    ],
  );
}

export async function deleteVocabulary(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM vocabulary WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Review queue + scheduling (the engine never references a specific language)
// ---------------------------------------------------------------------------

export interface QueueItem {
  entry: VocabularyEntry;
  state: CardState;
  isNew: boolean;
}

/**
 * Build the review queue: everything due, plus up to `newLimit` unseen items.
 * Comes entirely from local SQLite — sync (if ever added) never blocks this.
 */
export async function getReviewQueue(
  db: SQLite.SQLiteDatabase,
  languageId: number,
  now: Date = new Date(),
  newLimit = 5,
): Promise<QueueItem[]> {
  const nowIso = now.toISOString();
  const rows = await db.getAllAsync<{
    entry: VocabularyEntry;
    ease: number | null;
    interval_days: number | null;
    repetitions: number | null;
    lapses: number | null;
    due_date: string | null;
    last_reviewed_at: string | null;
  }>(
    `SELECT v.id, v.language_id AS languageId, v.category_id AS categoryId,
            v.target_text AS targetText, v.translation, v.notes, v.difficulty,
            v.audio_uri AS audioUri, v.image_uri AS imageUri,
            cs.ease, cs.interval_days, cs.repetitions, cs.lapses, cs.due_date, cs.last_reviewed_at
     FROM vocabulary v
     LEFT JOIN card_states cs ON cs.vocabulary_id = v.id
     WHERE v.language_id = ?
       AND (cs.vocabulary_id IS NULL OR cs.due_date <= ?)
     ORDER BY CASE WHEN cs.vocabulary_id IS NULL THEN 1 ELSE 0 END,
              COALESCE(cs.due_date, '1970-01-01T00:00:00.000Z'),
              v.id`,
    [languageId, nowIso],
  );

  const due: QueueItem[] = [];
  const fresh: QueueItem[] = [];
  for (const row of rows) {
    const isNew = row.ease === null;
    const state: CardState = isNew
      ? {
          vocabularyId: row.entry.id,
          ease: 2.5,
          intervalDays: 0,
          repetitions: 0,
          lapses: 0,
          dueDate: new Date(0).toISOString(),
          lastReviewedAt: null,
        }
      : {
          vocabularyId: row.entry.id,
          ease: row.ease!,
          intervalDays: row.interval_days!,
          repetitions: row.repetitions!,
          lapses: row.lapses!,
          dueDate: row.due_date!,
          lastReviewedAt: row.last_reviewed_at,
        };
    (isNew ? fresh : due).push({ entry: row.entry, state, isNew });
  }
  return [...due, ...fresh.slice(0, newLimit)];
}

/**
 * Apply an answer: advance SM-2 state and append a review log.
 * Returns the updated card state.
 */
export async function recordAnswer(
  db: SQLite.SQLiteDatabase,
  vocabularyId: number,
  answer: 'again' | 'good' | 'easy',
  timeSpentMs: number | null,
  now: Date = new Date(),
): Promise<CardState> {
  const quality = qualityFromAnswer(answer);
  const row = await db.getFirstAsync<{
    ease: number;
    interval_days: number;
    repetitions: number;
    lapses: number;
    due_date: string;
    last_reviewed_at: string | null;
  }>(
    'SELECT ease, interval_days, repetitions, lapses, due_date, last_reviewed_at FROM card_states WHERE vocabulary_id = ?',
    [vocabularyId],
  );

  const prev: Sm2State = row
    ? { ease: row.ease, intervalDays: row.interval_days, repetitions: row.repetitions, lapses: row.lapses }
    : { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

  const { state, dueDate } = schedule(prev, quality, now);
  const nowIso = now.toISOString();

  await db.runAsync(
    `INSERT INTO card_states (vocabulary_id, ease, interval_days, repetitions, lapses, due_date, last_reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(vocabulary_id) DO UPDATE SET
       ease = excluded.ease,
       interval_days = excluded.interval_days,
       repetitions = excluded.repetitions,
       lapses = excluded.lapses,
       due_date = excluded.due_date,
       last_reviewed_at = excluded.last_reviewed_at`,
    [
      vocabularyId,
      state.ease,
      state.intervalDays,
      state.repetitions,
      state.lapses,
      dueDate.toISOString(),
      nowIso,
    ],
  );

  await db.runAsync(
    'INSERT INTO review_logs (vocabulary_id, reviewed_at, quality, time_spent_ms) VALUES (?, ?, ?, ?)',
    [vocabularyId, nowIso, quality, timeSpentMs],
  );

  return {
    vocabularyId,
    ease: state.ease,
    intervalDays: state.intervalDays,
    repetitions: state.repetitions,
    lapses: state.lapses,
    dueDate: dueDate.toISOString(),
    lastReviewedAt: nowIso,
  };
}

// ---------------------------------------------------------------------------
// Progress (parent dashboard)
// ---------------------------------------------------------------------------

export async function getProgressStats(
  db: SQLite.SQLiteDatabase,
  languageId: number,
  now: Date = new Date(),
): Promise<ProgressStats> {
  const totals = await db.getFirstAsync<{ total: number; mastered: number; started: number }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN cs.repetitions >= 3 AND cs.interval_days >= 21 THEN 1 ELSE 0 END) AS mastered,
       SUM(CASE WHEN cs.vocabulary_id IS NOT NULL THEN 1 ELSE 0 END) AS started
     FROM vocabulary v
     LEFT JOIN card_states cs ON cs.vocabulary_id = v.id
     WHERE v.language_id = ?`,
    [languageId],
  );

  const total = totals?.total ?? 0;
  const mastered = totals?.mastered ?? 0;
  const started = totals?.started ?? 0;

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const agg = await db.getFirstAsync<{ correct: number | null; total: number; ms: number | null }>(
    `SELECT
       SUM(CASE WHEN r.quality >= 3 THEN 1 ELSE 0 END) AS correct,
       COUNT(*) AS total,
       SUM(r.time_spent_ms) AS ms
     FROM review_logs r
     JOIN vocabulary v ON v.id = r.vocabulary_id
     WHERE v.language_id = ? AND r.reviewed_at >= ?`,
    [languageId, thirtyDaysAgo],
  );

  const streakRows = await db.getAllAsync<{ reviewed_at: string }>(
    `SELECT r.reviewed_at FROM review_logs r
     JOIN vocabulary v ON v.id = r.vocabulary_id
     WHERE v.language_id = ?`,
    [languageId],
  );

  const reviewsToday = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM review_logs r
     JOIN vocabulary v ON v.id = r.vocabulary_id
     WHERE v.language_id = ? AND r.reviewed_at >= ?`,
    [languageId, todayStart],
  );

  return {
    total,
    mastered,
    learning: started - mastered,
    unseen: total - started,
    streakDays: computeStreak(streakRows.map((r) => r.reviewed_at), now),
    accuracy30d: agg && agg.total > 0 ? (agg.correct ?? 0) / agg.total : null,
    minutesSpent: Math.round((agg?.ms ?? 0) / 60000),
    reviewsToday: reviewsToday?.n ?? 0,
  };
}

/** Mastered count, used by milestone logic. */
export async function countMastered(db: SQLite.SQLiteDatabase, languageId: number): Promise<number> {
  const res = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n
     FROM card_states cs
     JOIN vocabulary v ON v.id = cs.vocabulary_id
     WHERE v.language_id = ? AND cs.repetitions >= 3 AND cs.interval_days >= 21`,
    [languageId],
  );
  return res?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Settings (key-value; local only)
// ---------------------------------------------------------------------------

/** New words introduced per review day, and free-practice session size. */
export const FREE_SESSION_LIMIT = 12;

/**
 * Words the learner has answered incorrectly in the last `days` window,
 * returned as ready-made queue items for a dedicated "practice mistakes"
 * session. Free practice mode only — does not advance the SM-2 schedule.
 */
export async function getMistakeWords(
  db: SQLite.SQLiteDatabase,
  languageId: number,
  days = 30,
  limit: number = FREE_SESSION_LIMIT,
): Promise<VocabularyEntry[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return db.getAllAsync<VocabularyEntry>(
    `SELECT DISTINCT
        v.id AS id,
        v.language_id AS languageId,
        v.category_id AS categoryId,
        v.target_text AS targetText,
        v.translation AS translation,
        v.notes AS notes,
        v.difficulty AS difficulty,
        v.audio_uri AS audioUri,
        v.image_uri AS imageUri
     FROM review_logs r
     JOIN vocabulary v ON v.id = r.vocabulary_id
     WHERE v.language_id = ? AND r.quality < 3 AND r.reviewed_at >= ?
     ORDER BY r.reviewed_at DESC
     LIMIT ?`,
    [languageId, since, limit],
  );
}


export const DAILY_GOAL_KEY = 'daily_goal';
export const DEFAULT_DAILY_GOAL = 5;

export async function getSetting(
  db: SQLite.SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSetting(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

/** New words introduced per review day. */
export async function getDailyGoal(db: SQLite.SQLiteDatabase): Promise<number> {
  const raw = await getSetting(db, DAILY_GOAL_KEY);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_GOAL;
}

export async function setDailyGoal(db: SQLite.SQLiteDatabase, goal: number): Promise<void> {
  await setSetting(db, DAILY_GOAL_KEY, String(goal));
}

export interface DayActivity {
  /** Weekday label, e.g. 'Mon'. */
  label: string;
  count: number;
  isToday: boolean;
}

/** Reviews per day for the last 7 days (local calendar days, oldest first). */
export async function getWeeklyActivity(
  db: SQLite.SQLiteDatabase,
  languageId: number,
  now: Date = new Date(),
): Promise<DayActivity[]> {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const rows = await db.getAllAsync<{ reviewed_at: string }>(
    `SELECT r.reviewed_at FROM review_logs r
     JOIN vocabulary v ON v.id = r.vocabulary_id
     WHERE v.language_id = ? AND r.reviewed_at >= ?`,
    [languageId, start.toISOString()],
  );

  const buckets = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.reviewed_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days: DayActivity[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.push({
      label: labels[d.getDay()],
      count: buckets.get(key) ?? 0,
      isToday: d.toDateString() === now.toDateString(),
    });
  }
  return days;
}

