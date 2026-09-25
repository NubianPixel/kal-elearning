/**
 * A1 progress storage: the local, offline, per-device record of what the
 * learner has done — separate from the read-only bundled content. Opens a
 * new database file (`kal-a1.db`); nothing else lives here (no audio, no
 * file paths — see design doc's privacy section).
 *
 * Queries go through Drizzle ORM (src/db/schema.ts is the single source of
 * truth for the tables; schema changes are generated into
 * src/db/migrations with `npm run db:generate` and applied on open via the
 * drizzle expo-sqlite migrator). Scheduling/pacing/pass-rule decisions
 * still live in src/core/* — this module only reads/writes rows.
 */

import * as SQLite from 'expo-sqlite';
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { sql, eq, and, lte, gte, isNull, inArray, desc, count, countDistinct } from 'drizzle-orm';
import migrations from './migrations/meta/_journal.json';
import * as schema from './schema';
import { cardStates, checkpointAttempts, goalDays, reviewLogs, settings, speakingRatings, unitSteps } from './schema';
import { schedule, gradeAnswer, isItemMastered, type CardType, type Sm2State } from '../core/srs';
import { computeStreak } from '../core/progress';
import { units, questionsForUnit } from '../content';
import { unitStatus, type UnitStep, type UnitStatus } from '../core/path';
import type { CheckpointScore, Skill } from '../core/checkpoint';

const DB_NAME = 'kal-a1.db';
const LEGACY_DB_NAME = 'kal-elearning.db';

export type ProgressDb = ExpoSQLiteDatabase<typeof schema>;

let dbPromise: Promise<ProgressDb> | null = null;

// The migration drizzle-kit generated from src/db/schema.ts, imported as a
// raw string via babel-plugin-extract-import (see metro.config.ts +
// babel.config.js) so the app applies it at runtime without fs access.
import migration0000 from './migrations/0000_wise_santa_claus.sql';

/**
 * Open (once) the A1 progress database, wrapped in a typed Drizzle client.
 * On first open, deletes the old pre-redesign database if present (spec:
 * fresh start, no migration), then applies the committed drizzle migrations.
 */
export function getProgressDb(): Promise<ProgressDb> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        await SQLite.deleteDatabaseAsync(LEGACY_DB_NAME);
      } catch {
        // ponytail: no legacy db to delete on a fresh install — fine to ignore.
      }
      const sqlite = await SQLite.openDatabaseAsync(DB_NAME);
      await sqlite.execAsync('PRAGMA foreign_keys = ON;');
      const db = drizzle(sqlite, { schema });
      await migrate(db, {
        journal: migrations as never,
        migrations: { '0': migration0000 },
      });
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

/** Values shared by every freshly-introduced card (SM-2 starting state). */
const NEW_CARD_DEFAULTS = {
  ease: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
} as const;

/** Introduce items: create listen+recall card states due now (Words step). No-op for items already introduced. */
export async function introduceItems(
  db: ProgressDb,
  itemIds: string[],
  now: Date = new Date(),
): Promise<void> {
  if (itemIds.length === 0) return;
  const nowIso = now.toISOString();
  // One batched multi-row insert with an UPSERT so re-introducing an item
  // stays a no-op (the old per-card statement loop paid a JS↔native hop each).
  const values = itemIds.flatMap((itemId) =>
    (['listen', 'recall'] as const).map((cardType) => ({
      itemId,
      cardType,
      ...NEW_CARD_DEFAULTS,
      dueDate: nowIso,
      introducedAt: nowIso,
    })),
  );
  await db.insert(cardStates).values(values).onConflictDoNothing();
}

/** Add drill cards for a unit's authored drill questions (Grammar step finished once). */
export async function addDrillCardsForUnit(
  db: ProgressDb,
  unit: number,
  now: Date = new Date(),
): Promise<void> {
  const drillQuestions = questionsForUnit(unit, 'drill');
  if (drillQuestions.length === 0) return;
  const nowIso = now.toISOString();
  await db
    .insert(cardStates)
    .values(
      drillQuestions.map((q) => ({
        itemId: q.id,
        cardType: 'drill' as const,
        ...NEW_CARD_DEFAULTS,
        dueDate: nowIso,
        introducedAt: nowIso,
      })),
    )
    .onConflictDoNothing();
}

export async function loadCardStates(db: ProgressDb): Promise<CardStateRow[]> {
  // Drizzle maps snake_case columns → camelCase fields, so rows come back
  // already shaped as CardStateRow — no manual mapping layer.
  return db.select().from(cardStates);
}

/** Ids of every item ever introduced (Words step) — recall cards are
 *  always created together with listen cards, so recall-card presence
 *  alone identifies "introduced". Used by Practice/Library (free
 *  practice/browsing over introduced items only). Filtered in SQL: the
 *  card_states table grows with drills + every future unit, and loading
 *  all rows just to keep ~a third of them was pure waste. */
export async function introducedItemIds(db: ProgressDb): Promise<Set<string>> {
  const rows = await db
    .select({ itemId: cardStates.itemId })
    .from(cardStates)
    .where(eq(cardStates.cardType, 'recall'));
  return new Set(rows.map((r) => r.itemId));
}

export async function loadDueCardStates(
  db: ProgressDb,
  now: Date = new Date(),
): Promise<CardStateRow[]> {
  return db.select().from(cardStates).where(lte(cardStates.dueDate, now.toISOString()));
}

/** Apply an answer: sm2 schedule (via gradeAnswer) + append a review log. Returns the new card state. */
export async function recordReview(
  db: ProgressDb,
  itemId: string,
  cardType: CardType,
  correct: boolean,
  timeSpentMs: number,
  now: Date = new Date(),
): Promise<CardStateRow> {
  const quality = gradeAnswer(correct, timeSpentMs);
  const row = await db
    .select({
      ease: cardStates.ease,
      intervalDays: cardStates.intervalDays,
      repetitions: cardStates.repetitions,
      lapses: cardStates.lapses,
    })
    .from(cardStates)
    .where(and(eq(cardStates.itemId, itemId), eq(cardStates.cardType, cardType)))
    .get();

  const prev: Sm2State = row
    ? { ease: row.ease, intervalDays: row.intervalDays, repetitions: row.repetitions, lapses: row.lapses }
    : { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

  const { state, dueDate } = schedule(prev, quality, now);
  const nowIso = now.toISOString();
  const dueIso = dueDate.toISOString();

  // DO UPDATE side reads the *excluded* (proposed) row, so every column is
  // spelled as a raw sql reference to its excluded value.
  const upsertSet = {
    ease: sql`excluded.ease`,
    intervalDays: sql`excluded.interval_days`,
    repetitions: sql`excluded.repetitions`,
    lapses: sql`excluded.lapses`,
    dueDate: sql`excluded.due_date`,
    lastReviewedAt: sql`excluded.last_reviewed_at`,
  };

  // Two statements (upsert + log insert) — one native round-trip each, so
  // a transaction wrapper would cost more than it saves.
  await db
    .insert(cardStates)
    .values({
      itemId,
      cardType,
      ease: state.ease,
      intervalDays: state.intervalDays,
      repetitions: state.repetitions,
      lapses: state.lapses,
      dueDate: dueIso,
      lastReviewedAt: nowIso,
      introducedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: [cardStates.itemId, cardStates.cardType],
      set: upsertSet,
    });
  await db
    .insert(reviewLogs)
    .values({ itemId, cardType, reviewedAt: nowIso, quality, timeSpentMs });

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
  db: ProgressDb,
  unit: number,
  step: UnitStep,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(unitSteps)
    .values({ unit, step, completedAt: now.toISOString() })
    .onConflictDoUpdate({
      target: [unitSteps.unit, unitSteps.step],
      set: { completedAt: sql`excluded.completed_at` },
    });
  if (step === 'grammar') await addDrillCardsForUnit(db, unit, now);
}

export async function completedSteps(db: ProgressDb, unit: number): Promise<UnitStep[]> {
  const rows = await db.select({ step: unitSteps.step }).from(unitSteps).where(eq(unitSteps.unit, unit));
  return rows.map((r) => r.step);
}

/** Every (unit, step) completion in one read — lets callers like the path
 *  loader build all units' step sets without a query per unit. */
export async function allCompletedSteps(db: ProgressDb): Promise<Array<{ unit: number; step: UnitStep }>> {
  return db.select({ unit: unitSteps.unit, step: unitSteps.step }).from(unitSteps);
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

interface CheckpointSqlRow {
  id: number;
  unit: number | null;
  overall: number;
  perSkillJson: string;
  passed: boolean;
  attemptedAt: string;
}

function checkpointAttemptFromRow(r: CheckpointSqlRow): CheckpointAttemptRow {
  return {
    id: r.id,
    unit: r.unit,
    overallPct: r.overall,
    perSkillPct: JSON.parse(r.perSkillJson),
    passed: r.passed,
    attemptedAt: r.attemptedAt,
  };
}

/** Save a checkpoint attempt. A pass on a real unit (not the exit test) also completes its Checkpoint step. */
export async function saveCheckpointAttempt(
  db: ProgressDb,
  unit: number | null,
  score: CheckpointScore,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(checkpointAttempts)
    .values({
      unit,
      overall: score.overallPct,
      perSkillJson: JSON.stringify(score.perSkillPct),
      passed: score.passed,
      attemptedAt: now.toISOString(),
    });
  if (unit != null && score.passed) await markStepComplete(db, unit, 'checkpoint', now);
}

export async function latestCheckpointAttempt(
  db: ProgressDb,
  unit: number | null,
): Promise<CheckpointAttemptRow | null> {
  const row = await db
    .select()
    .from(checkpointAttempts)
    .where(unit == null ? isNull(checkpointAttempts.unit) : eq(checkpointAttempts.unit, unit))
    .orderBy(desc(checkpointAttempts.attemptedAt))
    .limit(1)
    .get();
  return row ? checkpointAttemptFromRow(row) : null;
}

/** Units whose checkpoint has ever been passed (test-out included). */
export async function passedUnits(db: ProgressDb): Promise<Set<number>> {
  const rows = await db
    .select({ unit: checkpointAttempts.unit })
    .from(checkpointAttempts)
    .where(and(eq(checkpointAttempts.passed, true), sql`${checkpointAttempts.unit} IS NOT NULL`))
    .groupBy(checkpointAttempts.unit);
  return new Set(rows.map((r) => r.unit).filter((u): u is number => u != null));
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
export async function unitCheckpointBadges(db: ProgressDb): Promise<UnitCheckpointBadge[]> {
  const rows = await db
    .select({
      unit: checkpointAttempts.unit,
      best: sql<number>`MAX(${checkpointAttempts.overall})`.as('best'),
      everPassed: sql<number>`MAX(CAST(${checkpointAttempts.passed} AS INTEGER))`.as('ever_passed'),
    })
    .from(checkpointAttempts)
    .where(sql`${checkpointAttempts.unit} IS NOT NULL`)
    .groupBy(checkpointAttempts.unit);
  const byUnit = new Map(rows.map((r) => [r.unit as number, r]));
  return units.map((u) => {
    const r = byUnit.get(u.unit);
    return { unit: u.unit, attempted: !!r, passed: r ? r.everPassed === 1 : false, bestPct: r ? r.best : null };
  });
}

export async function exitTestPassed(db: ProgressDb): Promise<boolean> {
  const row = await db
    .select({ n: count() })
    .from(checkpointAttempts)
    .where(and(isNull(checkpointAttempts.unit), eq(checkpointAttempts.passed, true)))
    .get();
  return (row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Speaking (record-and-compare self-rating; never audio, never scored)
// ---------------------------------------------------------------------------

export type SpeakingRating = 'nailed' | 'close' | 'again';

export async function saveSpeakingRating(
  db: ProgressDb,
  itemId: string,
  rating: SpeakingRating,
  now: Date = new Date(),
): Promise<void> {
  await db.insert(speakingRatings).values({ itemId, rating, ratedAt: now.toISOString() });
}

/**
 * Item ids whose listen/recall review logs include a wrong answer
 * (quality < 3) in the last `days` days — the Practice tab's "Mistakes"
 * pool. Free practice, so this only reads review history; it never writes.
 */
export async function recentMistakeItemIds(
  db: ProgressDb,
  now: Date = new Date(),
  days = 30,
): Promise<string[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({ itemId: reviewLogs.itemId })
    .from(reviewLogs)
    .where(
      and(
        gte(reviewLogs.reviewedAt, since),
        sql`${reviewLogs.quality} < 3`,
        inArray(reviewLogs.cardType, ['listen', 'recall']),
      ),
    )
    .groupBy(reviewLogs.itemId);
  return rows.map((r) => r.itemId);
}

/** Most recently "again"-rated item ids, most recent first — resurfaced in Use-it. */
export async function recentAgainItems(db: ProgressDb, limit = 20): Promise<string[]> {
  const rows = await db
    .select({ itemId: speakingRatings.itemId })
    .from(speakingRatings)
    .where(eq(speakingRatings.rating, 'again'))
    .orderBy(desc(speakingRatings.ratedAt))
    .limit(limit);
  return rows.map((r) => r.itemId);
}

/** Count of distinct items ever rated in the record-and-compare step —
 *  the Progress tab's "words you've practised saying". Never reflects
 *  quality, only that speaking was attempted (self-rating never scores). */
export async function practicedSpeakingCount(db: ProgressDb): Promise<number> {
  const row = await db.select({ n: countDistinct(speakingRatings.itemId) }).from(speakingRatings).get();
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Daily counts, goal days, streak
// ---------------------------------------------------------------------------

function startOfDayIso(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export async function reviewedToday(db: ProgressDb, now: Date = new Date()): Promise<number> {
  // Indexed by reviewed_at; the >= bound lets SQLite use the index instead of
  // scanning every review log ever written.
  const row = await db
    .select({ n: count() })
    .from(reviewLogs)
    .where(gte(reviewLogs.reviewedAt, startOfDayIso(now)))
    .get();
  return row?.n ?? 0;
}

/** New items introduced today. Counts 'recall' card states only, since listen+recall are always introduced together. */
export async function introducedToday(db: ProgressDb, now: Date = new Date()): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(cardStates)
    .where(and(eq(cardStates.cardType, 'recall'), gte(cardStates.introducedAt, startOfDayIso(now))))
    .get();
  return row?.n ?? 0;
}

/** Local 'YYYY-MM-DD' for `now`. */
export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function markGoalDay(db: ProgressDb, day: string): Promise<void> {
  await db.insert(goalDays).values({ day }).onConflictDoNothing();
}

/** Streaks never reach back a year; capping the scan keeps the query (and
 *  computeStreak's input) bounded no matter how long the app is used. */
const STREAK_LOOKBACK_DAYS = 365;

export async function currentStreak(db: ProgressDb, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ day: goalDays.day })
    .from(goalDays)
    .where(gte(goalDays.day, localDay(since)))
    .orderBy(desc(goalDays.day));
  return computeStreak(rows.map((r) => r.day), now);
}

// ---------------------------------------------------------------------------
// Settings: daily N
// ---------------------------------------------------------------------------

const DAILY_N_KEY = 'daily_n';
export const DEFAULT_DAILY_N = 10;
export const DAILY_N_OPTIONS = [5, 10, 15] as const;

export async function getDailyN(db: ProgressDb): Promise<number> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, DAILY_N_KEY)).get();
  const n = row ? Number.parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_N;
}

export async function setDailyN(db: ProgressDb, n: number): Promise<void> {
  await db
    .insert(settings)
    .values({ key: DAILY_N_KEY, value: String(n) })
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
}

// ---------------------------------------------------------------------------
// Progress summary (words mastered, per-unit status)
// ---------------------------------------------------------------------------

export interface ProgressSummary {
  wordsMastered: number;
  unitStatuses: Array<{ unit: number; status: UnitStatus }>;
}

export async function progressSummary(db: ProgressDb): Promise<ProgressSummary> {
  // Aggregated in SQL (one row per item) instead of pulling every listen +
  // recall card state into JS and grouping it there.
  const rows = await db
    .select({
      itemId: cardStates.itemId,
      listenReps: sql<number | null>`MAX(CASE WHEN ${cardStates.cardType} = 'listen' THEN ${cardStates.repetitions} END)`.as('listen_reps'),
      listenInterval: sql<number | null>`MAX(CASE WHEN ${cardStates.cardType} = 'listen' THEN ${cardStates.intervalDays} END)`.as('listen_interval'),
      recallReps: sql<number | null>`MAX(CASE WHEN ${cardStates.cardType} = 'recall' THEN ${cardStates.repetitions} END)`.as('recall_reps'),
      recallInterval: sql<number | null>`MAX(CASE WHEN ${cardStates.cardType} = 'recall' THEN ${cardStates.intervalDays} END)`.as('recall_interval'),
    })
    .from(cardStates)
    .where(inArray(cardStates.cardType, ['listen', 'recall']))
    .groupBy(cardStates.itemId);

  let wordsMastered = 0;
  for (const r of rows) {
    if (
      isItemMastered(
        r.listenReps != null ? { repetitions: r.listenReps, intervalDays: r.listenInterval ?? 0 } : undefined,
        r.recallReps != null ? { repetitions: r.recallReps, intervalDays: r.recallInterval ?? 0 } : undefined,
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

export async function exportProgress(db: ProgressDb): Promise<ProgressExport> {
  const [cardStateRows, reviewLogRows, unitStepRows, checkpointRows, speakingRows, goalDayRows, settingsRows] =
    await Promise.all([
      db.select().from(cardStates),
      db
        .select({
          itemId: reviewLogs.itemId,
          cardType: reviewLogs.cardType,
          reviewedAt: reviewLogs.reviewedAt,
          quality: reviewLogs.quality,
          timeSpentMs: reviewLogs.timeSpentMs,
        })
        .from(reviewLogs),
      db
        .select({ unit: unitSteps.unit, step: unitSteps.step, completedAt: unitSteps.completedAt })
        .from(unitSteps),
      db.select().from(checkpointAttempts),
      db
        .select({ itemId: speakingRatings.itemId, rating: speakingRatings.rating, ratedAt: speakingRatings.ratedAt })
        .from(speakingRatings),
      db.select({ day: goalDays.day }).from(goalDays),
      db.select({ key: settings.key, value: settings.value }).from(settings),
    ]);

  return {
    version: PROGRESS_EXPORT_VERSION,
    cardStates: cardStateRows,
    reviewLogs: reviewLogRows,
    unitSteps: unitStepRows,
    checkpointAttempts: checkpointRows.map(checkpointAttemptFromRow),
    speakingRatings: speakingRows,
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
export async function importProgress(db: ProgressDb, obj: unknown): Promise<void> {
  if (typeof obj !== 'object' || obj === null || (obj as { version?: unknown }).version !== PROGRESS_EXPORT_VERSION) {
    throw new Error(`importProgress: unsupported or missing version (expected ${PROGRESS_EXPORT_VERSION})`);
  }
  if (!isProgressExportShape(obj)) {
    throw new Error('importProgress: malformed progress export');
  }
  const data = obj;

  await db.transaction(async (tx) => {
    await tx.delete(cardStates);
    await tx.delete(reviewLogs);
    await tx.delete(unitSteps);
    await tx.delete(checkpointAttempts);
    await tx.delete(speakingRatings);
    await tx.delete(goalDays);
    await tx.delete(settings);

    if (data.cardStates.length > 0) await tx.insert(cardStates).values(data.cardStates);
    if (data.reviewLogs.length > 0) await tx.insert(reviewLogs).values(data.reviewLogs);
    if (data.unitSteps.length > 0) await tx.insert(unitSteps).values(data.unitSteps);
    if (data.checkpointAttempts.length > 0) {
      await tx.insert(checkpointAttempts).values(
        data.checkpointAttempts.map((a) => ({
          unit: a.unit,
          overall: a.overallPct,
          perSkillJson: JSON.stringify(a.perSkillPct),
          passed: a.passed,
          attemptedAt: a.attemptedAt,
        })),
      );
    }
    if (data.speakingRatings.length > 0) await tx.insert(speakingRatings).values(data.speakingRatings);
    if (data.goalDays.length > 0) await tx.insert(goalDays).values(data.goalDays.map((day) => ({ day })));
    const settingEntries = Object.entries(data.settings);
    if (settingEntries.length > 0) {
      await tx.insert(settings).values(settingEntries.map(([key, value]) => ({ key, value })));
    }
  });
}
