/**
 * Data-access layer. Every query is language-scoped so the review engine
 * and UI work identically for any language the parent adds later.
 */

import type * as SQLite from 'expo-sqlite';
import { schedule, qualityFromAnswer, type Sm2State } from '../core/sm2';
import { computeStreak } from '../core/progress';
import { CHOICE_COUNT } from '../core/choices';
import type {
  CardState,
  Category,
  Difficulty,
  Language,
  ProgressStats,
  Story,
  StoryLine,
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
  const rows = await db.getAllAsync<
    VocabularyEntry & {
      ease: number | null;
      interval_days: number | null;
      repetitions: number | null;
      lapses: number | null;
      due_date: string | null;
      last_reviewed_at: string | null;
    }
  >(`SELECT v.id, v.language_id AS languageId, v.category_id AS categoryId,
            v.target_text AS targetText, v.translation, v.notes, v.difficulty,
            v.audio_uri AS audioUri, v.image_uri AS imageUri,
            cs.ease, cs.interval_days, cs.repetitions, cs.lapses, cs.due_date, cs.last_reviewed_at
       FROM vocabulary v
       LEFT JOIN card_states cs ON cs.vocabulary_id = v.id
       WHERE v.language_id = ?
         AND (cs.vocabulary_id IS NULL OR cs.due_date <= ?)
       ORDER BY CASE WHEN cs.vocabulary_id IS NULL THEN 1 ELSE 0 END,
                COALESCE(cs.due_date, '1970-01-01T00:00:00.000Z'),
                v.id`, [languageId, nowIso]);

  const due: QueueItem[] = [];
  const fresh: QueueItem[] = [];
  for (const row of rows) {
    const isNew = row.ease === null;
    const entry: VocabularyEntry = {
      id: row.id,
      languageId: row.languageId,
      categoryId: row.categoryId,
      targetText: row.targetText,
      translation: row.translation,
      notes: row.notes,
      difficulty: row.difficulty as VocabularyEntry['difficulty'],
      audioUri: row.audioUri,
      imageUri: row.imageUri,
    };
    const state: CardState = isNew
      ? {
          vocabularyId: entry.id,
          ease: 2.5,
          intervalDays: 0,
          repetitions: 0,
          lapses: 0,
          dueDate: new Date(0).toISOString(),
          lastReviewedAt: null,
        }
      : {
          vocabularyId: entry.id,
          ease: row.ease!,
          intervalDays: row.interval_days!,
          repetitions: row.repetitions!,
                    lapses: row.lapses!,
          dueDate: row.due_date!,
          lastReviewedAt: row.last_reviewed_at,
        };
    (isNew ? fresh : due).push({ entry, state, isNew });
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

/** Daily challenge pool: due words first, then never-practised, then learned words.
 *  Always yields content — used by the home "Daily Word Challenge" so a session
 *  can never come up empty on a library that has words in it. */
export async function getDailyChallengeWords(
  db: SQLite.SQLiteDatabase,
  languageId: number,
  limit: number = 10,
): Promise<VocabularyEntry[]> {
  return db.getAllAsync<VocabularyEntry>(
    `SELECT
        v.id AS id,
        v.language_id AS languageId,
        v.category_id AS categoryId,
        v.target_text AS targetText,
        v.translation AS translation,
        v.notes AS notes,
        v.difficulty AS difficulty,
        v.audio_uri AS audioUri,
        v.image_uri AS imageUri
     FROM vocabulary v
     LEFT JOIN card_states cs ON cs.vocabulary_id = v.id
     WHERE v.language_id = ?
     ORDER BY
       CASE
         WHEN cs.due_date IS NULL THEN 0          -- never seen: highest priority
         WHEN cs.due_date <= datetime('now') THEN 1  -- due: next
         ELSE 2                                    -- not due: last resort
       END,
       RANDOM()
     LIMIT ?`,
    [languageId, limit],
  );
}


export const DAILY_GOAL_KEY = 'daily_goal';
export const DEFAULT_DAILY_GOAL = 5;

/** Which of the five palettes (src/theme) is active. */
export const THEME_KEY = 'theme';

/** Gate the Parent Zone behind Face ID / fingerprint when set to '1'. */
export const BIOMETRIC_KEY = 'biometric_lock';


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

// ---------------------------------------------------------------------------
// Child difficulty (parent setting) + gamification XP
// ---------------------------------------------------------------------------

/** Difficulty knobs the parent chooses for the child. */
export type DifficultySetting = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_KEY = 'difficulty';
export const DEFAULT_DIFFICULTY: DifficultySetting = 'medium';

/** How many answer options to show for each review card by difficulty. */
export function choiceCountForDifficulty(d: DifficultySetting): number {
  return d === 'easy' ? CHOICE_COUNT - 1 : CHOICE_COUNT;
}

export async function getDifficulty(
  db: SQLite.SQLiteDatabase,
): Promise<DifficultySetting> {
  const raw = await getSetting(db, DIFFICULTY_KEY);
  return raw === 'easy' || raw === 'medium' || raw === 'hard' ? raw : DEFAULT_DIFFICULTY;
}

export async function setDifficulty(
  db: SQLite.SQLiteDatabase,
  value: DifficultySetting,
): Promise<void> {
  await setSetting(db, DIFFICULTY_KEY, value);
}

export const XP_KEY = 'xp';
export const DEFAULT_XP = 0;

/** Total lifetime XP the child has earned (stored in the settings table). */
export async function getXp(db: SQLite.SQLiteDatabase): Promise<number> {
  const raw = await getSetting(db, XP_KEY);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_XP;
}

/** Add XP and return the new total. */
export async function addXp(db: SQLite.SQLiteDatabase, delta: number): Promise<number> {
  const current = await getXp(db);
  const next = Math.max(0, current + delta);
  await setSetting(db, XP_KEY, String(next));
  return next;
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

// ---------------------------------------------------------------------------
// Stories (Story Time)
// ---------------------------------------------------------------------------

function storyFromRow(r: {
  id: number;
  language_id: number;
  title: string;
  icon: string | null;
  created_at: string;
}): Story {
  return {
    id: r.id,
    languageId: r.language_id,
    title: r.title,
    icon: r.icon,
    createdAt: r.created_at,
  };
}

function lineFromRow(r: {
  id: number;
  story_id: number;
  position: number;
  text_st: string;
  text_en: string | null;
  audio_st: string | null;
  audio_en: string | null;
}): StoryLine {
  return {
    id: r.id,
    storyId: r.story_id,
    position: r.position,
    textSt: r.text_st,
    textEn: r.text_en,
    audioSt: r.audio_st,
    audioEn: r.audio_en,
  };
}

/** All stories for a language, oldest first. */
export async function listStories(
  db: SQLite.SQLiteDatabase,
  languageId: number,
): Promise<Story[]> {
  const rows = await db.getAllAsync<Parameters<typeof storyFromRow>[0]>(
    'SELECT * FROM stories WHERE language_id = ? ORDER BY created_at, id',
    [languageId],
  );
  return rows.map(storyFromRow);
}

export async function createStory(
  db: SQLite.SQLiteDatabase,
  languageId: number,
  title: string,
  icon: string | null,
): Promise<Story> {
  const res = await db.runAsync(
    'INSERT INTO stories (language_id, title, icon) VALUES (?, ?, ?)',
    [languageId, title, icon],
  );
  const row = await db.getFirstAsync<Parameters<typeof storyFromRow>[0]>(
    'SELECT * FROM stories WHERE id = ?',
    [res.lastInsertRowId],
  );
  return storyFromRow(row!);
}

export async function deleteStory(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM stories WHERE id = ?', [id]);
}

/** Lines of a story in reading order. */
export async function listStoryLines(
  db: SQLite.SQLiteDatabase,
  storyId: number,
): Promise<StoryLine[]> {
  const rows = await db.getAllAsync<Parameters<typeof lineFromRow>[0]>(
    'SELECT * FROM story_lines WHERE story_id = ? ORDER BY position, id',
    [storyId],
  );
  return rows.map(lineFromRow);
}

export interface StoryLineInput {
  textSt: string;
  textEn: string | null;
  audioSt: string | null;
  audioEn: string | null;
}

/** Append a line at the end of a story. */
export async function createStoryLine(
  db: SQLite.SQLiteDatabase,
  storyId: number,
  input: StoryLineInput,
): Promise<StoryLine> {
  const max = await db.getFirstAsync<{ m: number | null }>(
    'SELECT MAX(position) AS m FROM story_lines WHERE story_id = ?',
    [storyId],
  );
  const position = (max?.m ?? -1) + 1;
  const res = await db.runAsync(
    'INSERT INTO story_lines (story_id, position, text_st, text_en, audio_st, audio_en) VALUES (?, ?, ?, ?, ?, ?)',
    [storyId, position, input.textSt, input.textEn, input.audioSt, input.audioEn],
  );
  const row = await db.getFirstAsync<Parameters<typeof lineFromRow>[0]>(
    'SELECT * FROM story_lines WHERE id = ?',
    [res.lastInsertRowId],
  );
  return lineFromRow(row!);
}

export async function updateStoryLine(
  db: SQLite.SQLiteDatabase,
  id: number,
  input: StoryLineInput,
): Promise<void> {
  await db.runAsync(
    'UPDATE story_lines SET text_st = ?, text_en = ?, audio_st = ?, audio_en = ? WHERE id = ?',
    [input.textSt, input.textEn, input.audioSt, input.audioEn, id],
  );
}

export async function deleteStoryLine(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM story_lines WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Pronunciation attempts — PRIVACY: score metadata ONLY. The user's voice
// is never persisted: no audio files, no audio paths, no blobs. Only the
// final accuracy score, DTW distance and duration live in the database.
// ---------------------------------------------------------------------------

export interface PronunciationAttempt {
  id: number;
  vocabularyId: number;
  accuracyScore: number; // 0–100
  dtwDistance: number;
  durationMs: number;
  createdAt: string;
}

/** Persist ONLY the score metadata of a scored attempt. */
export async function savePronunciationAttempt(
  db: SQLite.SQLiteDatabase,
  vocabularyId: number,
  attempt: { accuracy: number; dtwDistance: number; durationMs: number },
): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO pronunciation_attempts (vocabulary_id, accuracy_score, dtw_distance, duration_ms)
     VALUES (?, ?, ?, ?)`,
    [vocabularyId, attempt.accuracy, attempt.dtwDistance, attempt.durationMs],
  );
  return res.lastInsertRowId;
}

interface PronAttemptRow {
  id: number;
  vocabularyId: number;
  accuracyScore: number;
  dtwDistance: number;
  durationMs: number;
  createdAt: string;
}

function attemptFromRow(r: PronAttemptRow): PronunciationAttempt {
  return {
    id: r.id,
    vocabularyId: r.vocabularyId,
    accuracyScore: r.accuracyScore,
    dtwDistance: r.dtwDistance,
    durationMs: r.durationMs,
    createdAt: r.createdAt,
  };
}

/** All attempts for a word, newest first. */
export async function listPronunciationAttempts(
  db: SQLite.SQLiteDatabase,
  vocabularyId: number,
  limit = 20,
): Promise<PronunciationAttempt[]> {
  const rows = await db.getAllAsync<PronAttemptRow>(
    `SELECT id, vocabulary_id AS vocabularyId, accuracy_score AS accuracyScore,
            dtw_distance AS dtwDistance, duration_ms AS durationMs, created_at AS createdAt
     FROM pronunciation_attempts
     WHERE vocabulary_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [vocabularyId, limit],
  );
  return rows.map(attemptFromRow);
}

/** Best (highest) accuracy ever recorded for a word, or null. */
export async function getBestPronunciationScore(
  db: SQLite.SQLiteDatabase,
  vocabularyId: number,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ best: number | null }>(
    'SELECT MAX(accuracy_score) AS best FROM pronunciation_attempts WHERE vocabulary_id = ?',
    [vocabularyId],
  );
  return row?.best ?? null;
}

