/**
 * A1 progress storage: the local, offline, per-device record of what the
 * learner has done — separate from the read-only bundled content. Opens a
 * new database file (`kal-a1.db`); nothing else lives here (no audio, no
 * file paths — see design doc's privacy section).
 *
 * SQL stays thin; scheduling/pacing/pass-rule decisions live in
 * src/core/*.
 */

import * as SQLite from 'expo-sqlite';
import { A1_SCHEMA_SQL } from './progressSchema';
import { schedule, gradeAnswer, isItemMastered, type CardType, type Sm2State } from '../core/srs';
import { computeStreak } from '../core/progress';
import { units, questionsForUnit } from '../content';
import { unitStatus, type UnitStep, type UnitStatus } from '../core/path';
import type { CheckpointScore, Skill } from '../core/checkpoint';

const DB_NAME = 'kal-a1.db';
const LEGACY_DB_NAME = 'kal-elearning.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open (once) the A1 progress database. On first open, deletes the old
 * pre-redesign database if present (spec: fresh start, no migration).
 * Nothing calls this yet — the UI agent wires it in.
 */
export function getProgressDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        await SQLite.deleteDatabaseAsync(LEGACY_DB_NAME);
      } catch {
        // ponytail: no legacy db to delete on a fresh install — fine to ignore.
      }
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(A1_SCHEMA_SQL);
      return db;
    })();
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Card states
// ---------------------------------------------------------------------------

export interface CardStateRow {
  itemId: string;
  cardType: CardType;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: string;
  lastReviewedAt: string | null;
  introducedAt: string | null;
}

interface CardStateSqlRow {
  item_id: string;
  card_type: CardType;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_date: string;
  last_reviewed_at: string | null;
  introduced_at: string | null;
}

function cardStateFromRow(r: CardStateSqlRow): CardStateRow {
  return {
    itemId: r.item_id,
    cardType: r.card_type,
    ease: r.ease,
    intervalDays: r.interval_days,
    repetitions: r.repetitions,
    lapses: r.lapses,
    dueDate: r.due_date,
    lastReviewedAt: r.last_reviewed_at,
    introducedAt: r.introduced_at,
  };
}

const CARD_STATE_SELECT =
  'SELECT item_id, card_type, ease, interval_days, repetitions, lapses, due_date, last_reviewed_at, introduced_at FROM card_states';

/** Introduce items: create listen+recall card states due now (Words step). No-op for items already introduced. */
export async function introduceItems(
  db: SQLite.SQLiteDatabase,
  itemIds: string[],
  now: Date = new Date(),
): Promise<void> {
  if (itemIds.length === 0) return;
  const nowIso = now.toISOString();
  // One transaction + one statement per card instead of N sequential
  // round-trips (each awaited write used to pay its own JS↔native hop).
  await db.withTransactionAsync(async () => {
    for (const itemId of itemIds) {
      for (const cardType of ['listen', 'recall'] as const) {
        await db.runAsync(
          `INSERT INTO card_states (item_id, card_type, ease, interval_days, repetitions, lapses, due_date, introduced_at)
           VALUES (?, ?, 2.5, 0, 0, 0, ?, ?)
           ON CONFLICT(item_id, card_type) DO NOTHING`,
          [itemId, cardType, nowIso, nowIso],
        );
      }
    }
  });
}

/** Add drill cards for a unit's authored drill questions (Grammar step finished once). */
export async function addDrillCardsForUnit(
  db: SQLite.SQLiteDatabase,
  unit: number,
  now: Date = new Date(),
): Promise<void> {
  const drillQuestions = questionsForUnit(unit, 'drill');
  if (drillQuestions.length === 0) return;
  const nowIso = now.toISOString();
  await db.withTransactionAsync(async () => {
    for (const q of drillQuestions) {
      await db.runAsync(
        `INSERT INTO card_states (item_id, card_type, ease, interval_days, repetitions, lapses, due_date, introduced_at)
         VALUES (?, 'drill', 2.5, 0, 0, 0, ?, ?)
         ON CONFLICT(item_id, card_type) DO NOTHING`,
        [q.id, nowIso, nowIso],
      );
    }
  });
}

export async function loadCardStates(db: SQLite.SQLiteDatabase): Promise<CardStateRow[]> {
  const rows = await db.getAllAsync<CardStateSqlRow>(CARD_STATE_SELECT);
  return rows.map(cardStateFromRow);
}

/** Ids of every item ever introduced (Words step) — recall cards are
 *  always created together with listen cards, so recall-card presence
 *  alone identifies "introduced". Used by Practice/Library (free
 *  practice/browsing over introduced items only). Filtered in SQL: the
 *  card_states table grows with drills + every future unit, and loading
 *  all rows just to keep ~a third of them was pure waste. */
export async function introducedItemIds(db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ item_id: string }>(
    "SELECT item_id FROM card_states WHERE card_type = 'recall'",
  );
  return new Set(rows.map((r) => r.item_id));
}

export async function loadDueCardStates(
  db: SQLite.SQLiteDatabase,
  now: Date = new Date(),
): Promise<CardStateRow[]> {
  const rows = await db.getAllAsync<CardStateSqlRow>(`${CARD_STATE_SELECT} WHERE due_date <= ?`, [
    now.toISOString(),
  ]);
  return rows.map(cardStateFromRow);
}

/** Apply an answer: sm2 schedule (via gradeAnswer) + append a review log. Returns the new card state. */
export async function recordReview(
  db: SQLite.SQLiteDatabase,
  itemId: string,
  cardType: CardType,
  correct: boolean,
  timeSpentMs: number,
  now: Date = new Date(),
): Promise<CardStateRow> {
  const quality = gradeAnswer(correct, timeSpentMs);
  const row = await db.getFirstAsync<{
    ease: number;
    interval_days: number;
    repetitions: number;
    lapses: number;
  }>('SELECT ease, interval_days, repetitions, lapses FROM card_states WHERE item_id = ? AND card_type = ?', [
    itemId,
    cardType,
  ]);

  const prev: Sm2State = row
    ? { ease: row.ease, intervalDays: row.interval_days, repetitions: row.repetitions, lapses: row.lapses }
    : { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

  const { state, dueDate } = schedule(prev, quality, now);
  const nowIso = now.toISOString();
  const dueIso = dueDate.toISOString();

  await db.runAsync(
    `INSERT INTO card_states (item_id, card_type, ease, interval_days, repetitions, lapses, due_date, last_reviewed_at, introduced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id, card_type) DO UPDATE SET
       ease = excluded.ease, interval_days = excluded.interval_days, repetitions = excluded.repetitions,
       lapses = excluded.lapses, due_date = excluded.due_date, last_reviewed_at = excluded.last_reviewed_at`,
    [itemId, cardType, state.ease, state.intervalDays, state.repetitions, state.lapses, dueIso, nowIso, nowIso],
  );
  await db.runAsync(
    'INSERT INTO review_logs (item_id, card_type, reviewed_at, quality, time_spent_ms) VALUES (?, ?, ?, ?, ?)',
    [itemId, cardType, nowIso, quality, timeSpentMs],
  );

  return {
    itemId,
    cardType,
    ease: state.ease,
    intervalDays: state.intervalDays,
    repetitions: state.repetitions,
    lapses: state.lapses,
    dueDate: dueIso,
    lastReviewedAt: nowIso,
    introducedAt: row ? null : nowIso,
  };
}

// ---------------------------------------------------------------------------
// Unit steps
// ---------------------------------------------------------------------------

/** Mark a unit step complete. Finishing Grammar also creates that unit's drill cards. */
export async function markStepComplete(
  db: SQLite.SQLiteDatabase,
  unit: number,
  step: UnitStep,
  now: Date = new Date(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO unit_steps (unit, step, completed_at) VALUES (?, ?, ?)
     ON CONFLICT(unit, step) DO UPDATE SET completed_at = excluded.completed_at`,
    [unit, step, now.toISOString()],
  );
  if (step === 'grammar') await addDrillCardsForUnit(db, unit, now);
}

export async function completedSteps(db: SQLite.SQLiteDatabase, unit: number): Promise<UnitStep[]> {
  const rows = await db.getAllAsync<{ step: UnitStep }>('SELECT step FROM unit_steps WHERE unit = ?', [unit]);
  return rows.map((r) => r.step);
}

/** Every (unit, step) completion in one read — lets callers like the path
 *  loader build all units' step sets without a query per unit. */
export async function allCompletedSteps(db: SQLite.SQLiteDatabase): Promise<Array<{ unit: number; step: UnitStep }>> {
  return db.getAllAsync<{ unit: number; step: UnitStep }>('SELECT unit, step FROM unit_steps');
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

export interface CheckpointAttemptRow {
  id: number;
  unit: number | null;
  overallPct: number;
  perSkillPct: Partial<Record<Skill, number>>;
  passed: boolean;
  attemptedAt: string;
}

interface CheckpointAttemptSqlRow {
  id: number;
  unit: number | null;
  overall: number;
  per_skill_json: string;
  passed: number;
  attempted_at: string;
}

function checkpointAttemptFromRow(r: CheckpointAttemptSqlRow): CheckpointAttemptRow {
  return {
    id: r.id,
    unit: r.unit,
    overallPct: r.overall,
    perSkillPct: JSON.parse(r.per_skill_json),
    passed: r.passed === 1,
    attemptedAt: r.attempted_at,
  };
}

/** Save a checkpoint attempt. A pass on a real unit (not the exit test) also completes its Checkpoint step. */
export async function saveCheckpointAttempt(
  db: SQLite.SQLiteDatabase,
  unit: number | null,
  score: CheckpointScore,
  now: Date = new Date(),
): Promise<void> {
  await db.runAsync(
    'INSERT INTO checkpoint_attempts (unit, overall, per_skill_json, passed, attempted_at) VALUES (?, ?, ?, ?, ?)',
    [unit, score.overallPct, JSON.stringify(score.perSkillPct), score.passed ? 1 : 0, now.toISOString()],
  );
  if (unit != null && score.passed) await markStepComplete(db, unit, 'checkpoint', now);
}

export async function latestCheckpointAttempt(
  db: SQLite.SQLiteDatabase,
  unit: number | null,
): Promise<CheckpointAttemptRow | null> {
  const row = await db.getFirstAsync<CheckpointAttemptSqlRow>(
    'SELECT * FROM checkpoint_attempts WHERE unit IS ? ORDER BY attempted_at DESC LIMIT 1',
    [unit],
  );
  return row ? checkpointAttemptFromRow(row) : null;
}

/** Units whose checkpoint has ever been passed (test-out included). */
export async function passedUnits(db: SQLite.SQLiteDatabase): Promise<Set<number>> {
  const rows = await db.getAllAsync<{ unit: number }>(
    'SELECT DISTINCT unit FROM checkpoint_attempts WHERE passed = 1 AND unit IS NOT NULL',
  );
  return new Set(rows.map((r) => r.unit));
}

export interface UnitCheckpointBadge {
  unit: number;
  attempted: boolean;
  passed: boolean;
  /** Best (highest) overall % across every attempt at this unit's checkpoint, or null if never attempted. */
  bestPct: number | null;
}

/** One badge per authored unit — best score and whether it's ever been
 *  passed (including test-out) — for the Progress tab's checkpoint list. */
export async function unitCheckpointBadges(db: SQLite.SQLiteDatabase): Promise<UnitCheckpointBadge[]> {
  const rows = await db.getAllAsync<{ unit: number; best: number; ever_passed: number }>(
    'SELECT unit, MAX(overall) AS best, MAX(passed) AS ever_passed FROM checkpoint_attempts WHERE unit IS NOT NULL GROUP BY unit',
  );
  const byUnit = new Map(rows.map((r) => [r.unit, r]));
  return units.map((u) => {
    const r = byUnit.get(u.unit);
    return { unit: u.unit, attempted: !!r, passed: r ? r.ever_passed === 1 : false, bestPct: r ? r.best : null };
  });
}

export async function exitTestPassed(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM checkpoint_attempts WHERE unit IS NULL AND passed = 1',
  );
  return (row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Speaking (record-and-compare self-rating; never audio, never scored)
// ---------------------------------------------------------------------------

export type SpeakingRating = 'nailed' | 'close' | 'again';

export async function saveSpeakingRating(
  db: SQLite.SQLiteDatabase,
  itemId: string,
  rating: SpeakingRating,
  now: Date = new Date(),
): Promise<void> {
  await db.runAsync('INSERT INTO speaking_ratings (item_id, rating, rated_at) VALUES (?, ?, ?)', [
    itemId,
    rating,
    now.toISOString(),
  ]);
}

/**
 * Item ids whose listen/recall review logs include a wrong answer
 * (quality < 3) in the last `days` days — the Practice tab's "Mistakes"
 * pool. Free practice, so this only reads review history; it never writes.
 */
export async function recentMistakeItemIds(
  db: SQLite.SQLiteDatabase,
  now: Date = new Date(),
  days = 30,
): Promise<string[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.getAllAsync<{ item_id: string }>(
    "SELECT DISTINCT item_id FROM review_logs WHERE reviewed_at >= ? AND quality < 3 AND card_type IN ('listen', 'recall')",
    [since],
  );
  return rows.map((r) => r.item_id);
}

/** Most recently "again"-rated item ids, most recent first — resurfaced in Use-it. */
export async function recentAgainItems(db: SQLite.SQLiteDatabase, limit = 20): Promise<string[]> {
  const rows = await db.getAllAsync<{ item_id: string }>(
    "SELECT item_id FROM speaking_ratings WHERE rating = 'again' ORDER BY rated_at DESC LIMIT ?",
    [limit],
  );
  return rows.map((r) => r.item_id);
}

/** Count of distinct items ever rated in the record-and-compare step —
 *  the Progress tab's "words you've practised saying". Never reflects
 *  quality, only that speaking was attempted (self-rating never scores). */
export async function practicedSpeakingCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(DISTINCT item_id) AS n FROM speaking_ratings');
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Daily counts, goal days, streak
// ---------------------------------------------------------------------------

function startOfDayIso(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export async function reviewedToday(db: SQLite.SQLiteDatabase, now: Date = new Date()): Promise<number> {
  // Indexed by reviewed_at; the >= bound lets SQLite use the index instead of
  // scanning every review log ever written.
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM review_logs WHERE reviewed_at >= ?',
    [startOfDayIso(now)],
  );
  return row?.n ?? 0;
}

/** New items introduced today. Counts 'recall' card states only, since listen+recall are always introduced together. */
export async function introducedToday(db: SQLite.SQLiteDatabase, now: Date = new Date()): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_states WHERE card_type = 'recall' AND introduced_at >= ?",
    [startOfDayIso(now)],
  );
  return row?.n ?? 0;
}

/** Local 'YYYY-MM-DD' for `now`. */
export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function markGoalDay(db: SQLite.SQLiteDatabase, day: string): Promise<void> {
  await db.runAsync('INSERT INTO goal_days (day) VALUES (?) ON CONFLICT(day) DO NOTHING', [day]);
}

/** Streaks never reach back a year; capping the scan keeps the query (and
 *  computeStreak's input) bounded no matter how long the app is used. */
const STREAK_LOOKBACK_DAYS = 365;

export async function currentStreak(db: SQLite.SQLiteDatabase, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.getAllAsync<{ day: string }>(
    'SELECT day FROM goal_days WHERE day >= ? ORDER BY day DESC',
    [localDay(since)],
  );
  return computeStreak(rows.map((r) => r.day), now);
}

// ---------------------------------------------------------------------------
// Settings: daily N
// ---------------------------------------------------------------------------

const DAILY_N_KEY = 'daily_n';
export const DEFAULT_DAILY_N = 10;
export const DAILY_N_OPTIONS = [5, 10, 15] as const;

export async function getDailyN(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [DAILY_N_KEY]);
  const n = row ? Number.parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_N;
}

export async function setDailyN(db: SQLite.SQLiteDatabase, n: number): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [DAILY_N_KEY, String(n)],
  );
}

// ---------------------------------------------------------------------------
// Progress summary (words mastered, per-unit status)
// ---------------------------------------------------------------------------

export interface ProgressSummary {
  wordsMastered: number;
  unitStatuses: Array<{ unit: number; status: UnitStatus }>;
}

export async function progressSummary(db: SQLite.SQLiteDatabase): Promise<ProgressSummary> {
  // Aggregated in SQL (one row per item) instead of pulling every listen +
  // recall card state into JS and grouping it there.
  const rows = await db.getAllAsync<{
    item_id: string;
    listen_reps: number | null;
    listen_interval: number | null;
    recall_reps: number | null;
    recall_interval: number | null;
  }>(
    `SELECT item_id,
            MAX(CASE WHEN card_type = 'listen' THEN repetitions END)   AS listen_reps,
            MAX(CASE WHEN card_type = 'listen' THEN interval_days END) AS listen_interval,
            MAX(CASE WHEN card_type = 'recall' THEN repetitions END)   AS recall_reps,
            MAX(CASE WHEN card_type = 'recall' THEN interval_days END) AS recall_interval
     FROM card_states
     WHERE card_type IN ('listen', 'recall')
     GROUP BY item_id`,
  );

  let wordsMastered = 0;
  for (const r of rows) {
    if (
      isItemMastered(
        r.listen_reps != null ? { repetitions: r.listen_reps, intervalDays: r.listen_interval ?? 0 } : undefined,
        r.recall_reps != null ? { repetitions: r.recall_reps, intervalDays: r.recall_interval ?? 0 } : undefined,
      )
    ) {
      wordsMastered += 1;
    }
  }

  const passed = await passedUnits(db);
  const unitStatuses = units.map((u) => ({ unit: u.unit, status: unitStatus(u.unit, passed) }));

  return { wordsMastered, unitStatuses };
}

// ---------------------------------------------------------------------------
// Export / import (Progress screen backup — never audio)
// ---------------------------------------------------------------------------

export const PROGRESS_EXPORT_VERSION = 1;

export interface ProgressExport {
  version: number;
  cardStates: CardStateRow[];
  reviewLogs: Array<{ itemId: string; cardType: CardType; reviewedAt: string; quality: number; timeSpentMs: number | null }>;
  unitSteps: Array<{ unit: number; step: UnitStep; completedAt: string }>;
  checkpointAttempts: CheckpointAttemptRow[];
  speakingRatings: Array<{ itemId: string; rating: SpeakingRating; ratedAt: string }>;
  goalDays: string[];
  settings: Record<string, string>;
}

export async function exportProgress(db: SQLite.SQLiteDatabase): Promise<ProgressExport> {
  const [cardStateRows, reviewLogRows, unitStepRows, checkpointRows, speakingRows, goalDayRows, settingsRows] =
    await Promise.all([
      db.getAllAsync<CardStateSqlRow>(CARD_STATE_SELECT),
      db.getAllAsync<{ item_id: string; card_type: CardType; reviewed_at: string; quality: number; time_spent_ms: number | null }>(
        'SELECT item_id, card_type, reviewed_at, quality, time_spent_ms FROM review_logs',
      ),
      db.getAllAsync<{ unit: number; step: UnitStep; completed_at: string }>(
        'SELECT unit, step, completed_at FROM unit_steps',
      ),
      db.getAllAsync<CheckpointAttemptSqlRow>('SELECT * FROM checkpoint_attempts'),
      db.getAllAsync<{ item_id: string; rating: SpeakingRating; rated_at: string }>(
        'SELECT item_id, rating, rated_at FROM speaking_ratings',
      ),
      db.getAllAsync<{ day: string }>('SELECT day FROM goal_days'),
      db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings'),
    ]);

  return {
    version: PROGRESS_EXPORT_VERSION,
    cardStates: cardStateRows.map(cardStateFromRow),
    reviewLogs: reviewLogRows.map((r) => ({
      itemId: r.item_id,
      cardType: r.card_type,
      reviewedAt: r.reviewed_at,
      quality: r.quality,
      timeSpentMs: r.time_spent_ms,
    })),
    unitSteps: unitStepRows.map((r) => ({ unit: r.unit, step: r.step, completedAt: r.completed_at })),
    checkpointAttempts: checkpointRows.map(checkpointAttemptFromRow),
    speakingRatings: speakingRows.map((r) => ({ itemId: r.item_id, rating: r.rating, ratedAt: r.rated_at })),
    goalDays: goalDayRows.map((r) => r.day),
    settings: Object.fromEntries(settingsRows.map((r) => [r.key, r.value])),
  };
}

function isProgressExportShape(obj: unknown): obj is ProgressExport {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    Array.isArray(o.cardStates) &&
    Array.isArray(o.reviewLogs) &&
    Array.isArray(o.unitSteps) &&
    Array.isArray(o.checkpointAttempts) &&
    Array.isArray(o.speakingRatings) &&
    Array.isArray(o.goalDays) &&
    typeof o.settings === 'object' &&
    o.settings !== null
  );
}

/** Validate and replace all progress with `obj`, in one transaction. Throws on a bad version or shape. */
export async function importProgress(db: SQLite.SQLiteDatabase, obj: unknown): Promise<void> {
  if (typeof obj !== 'object' || obj === null || (obj as { version?: unknown }).version !== PROGRESS_EXPORT_VERSION) {
    throw new Error(`importProgress: unsupported or missing version (expected ${PROGRESS_EXPORT_VERSION})`);
  }
  if (!isProgressExportShape(obj)) {
    throw new Error('importProgress: malformed progress export');
  }
  const data = obj;

  await db.withTransactionAsync(async () => {
    await db.execAsync(
      'DELETE FROM card_states; DELETE FROM review_logs; DELETE FROM unit_steps; ' +
        'DELETE FROM checkpoint_attempts; DELETE FROM speaking_ratings; DELETE FROM goal_days; DELETE FROM settings;',
    );

    for (const c of data.cardStates) {
      await db.runAsync(
        `INSERT INTO card_states (item_id, card_type, ease, interval_days, repetitions, lapses, due_date, last_reviewed_at, introduced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.itemId, c.cardType, c.ease, c.intervalDays, c.repetitions, c.lapses, c.dueDate, c.lastReviewedAt, c.introducedAt],
      );
    }
    for (const r of data.reviewLogs) {
      await db.runAsync(
        'INSERT INTO review_logs (item_id, card_type, reviewed_at, quality, time_spent_ms) VALUES (?, ?, ?, ?, ?)',
        [r.itemId, r.cardType, r.reviewedAt, r.quality, r.timeSpentMs],
      );
    }
    for (const s of data.unitSteps) {
      await db.runAsync('INSERT INTO unit_steps (unit, step, completed_at) VALUES (?, ?, ?)', [
        s.unit,
        s.step,
        s.completedAt,
      ]);
    }
    for (const a of data.checkpointAttempts) {
      await db.runAsync(
        'INSERT INTO checkpoint_attempts (unit, overall, per_skill_json, passed, attempted_at) VALUES (?, ?, ?, ?, ?)',
        [a.unit, a.overallPct, JSON.stringify(a.perSkillPct), a.passed ? 1 : 0, a.attemptedAt],
      );
    }
    for (const r of data.speakingRatings) {
      await db.runAsync('INSERT INTO speaking_ratings (item_id, rating, rated_at) VALUES (?, ?, ?)', [
        r.itemId,
        r.rating,
        r.ratedAt,
      ]);
    }
    for (const day of data.goalDays) {
      await db.runAsync('INSERT INTO goal_days (day) VALUES (?)', [day]);
    }
    for (const [key, value] of Object.entries(data.settings)) {
      await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  });
}
