/**
 * Drizzle ORM schema for the A1 progress database (`kal-a1.db`). This is the
 * single source of truth for the tables — `drizzle-kit` generates SQL from it
 * (see drizzle.config.ts + src/db/migrations/), and `src/db/progress.ts`
 * queries it type-safely instead of hand-written SQL strings.
 *
 * Column names stay snake_case in SQLite (the raw table layout predates the
 * ORM and is kept byte-compatible); camelCase JS names are exposed via the
 * `name:` option, so query results come back typed and camelCased directly —
 * no manual row-mapping layer needed.
 *
 * PRIVACY: same rule as before — self-ratings only, no audio, no file paths.
 */

import { integer, real, sqliteTable, text, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const CARD_TYPES = ['listen', 'recall', 'drill'] as const;
export type CardTypeFromSchema = (typeof CARD_TYPES)[number];

const UNIT_STEP_NAMES = ['words', 'grammar', 'useit', 'checkpoint'] as const;
export type UnitStepName = (typeof UNIT_STEP_NAMES)[number];

const SPEAKING_RATING_NAMES = ['nailed', 'close', 'again'] as const;
export type SpeakingRatingName = (typeof SPEAKING_RATING_NAMES)[number];

/** SM-2 scheduling state per card (item × card type). */
export const cardStates = sqliteTable(
  'card_states',
  {
    itemId: text('item_id').notNull(),
    cardType: text('card_type', { enum: CARD_TYPES }).notNull(),
    ease: real('ease').notNull().default(2.5),
    intervalDays: real('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    dueDate: text('due_date').notNull().default('1970-01-01T00:00:00.000Z'),
    lastReviewedAt: text('last_reviewed_at'),
    introducedAt: text('introduced_at'),
  },
  (t) => [
    // Composite primary key → its implicit rowid-less index also serves
    // item_id lookups (recordReview's read path).
    primaryKey({ columns: [t.itemId, t.cardType] }),
    // Due-card query (loadDueCardStates) filters on due_date alone.
    index('idx_card_states_due').on(t.dueDate),
  ],
);

/** Append-only review history; powers reviewedToday, mistakes pool, export. */
export const reviewLogs = sqliteTable(
  'review_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id').notNull(),
    cardType: text('card_type', { enum: CARD_TYPES }).notNull(),
    reviewedAt: text('reviewed_at').notNull(),
    quality: integer('quality').notNull(),
    timeSpentMs: integer('time_spent_ms'),
  },
  (t) => [
    // Mistakes-pool lookup: item + type, newest first.
    index('idx_review_logs_item').on(t.itemId, t.cardType, t.reviewedAt),
    // Daily-goal counts (reviewedToday) filter on reviewed_at alone; without
    // this they'd full-scan every log ever written.
    index('idx_review_logs_reviewed_at').on(t.reviewedAt),
  ],
);

/** One row per completed (unit, step) on the guided path. */
export const unitSteps = sqliteTable(
  'unit_steps',
  {
    unit: integer('unit').notNull(),
    step: text('step', { enum: UNIT_STEP_NAMES }).notNull(),
    completedAt: text('completed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.unit, t.step] })],
);

/** Checkpoint attempts; `unit` is NULL for the A1 exit test. */
export const checkpointAttempts = sqliteTable(
  'checkpoint_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    unit: integer('unit'),
    overall: real('overall').notNull(),
    perSkillJson: text('per_skill_json').notNull(),
    passed: integer('passed', { mode: 'boolean' }).notNull(),
    attemptedAt: text('attempted_at').notNull(),
  },
  (t) => [
    // Latest-attempt-per-unit and badge aggregation both start at unit.
    index('idx_checkpoint_attempts_unit').on(t.unit, t.attemptedAt),
  ],
);

/** Record-and-compare self-ratings (never audio, never scored). */
export const speakingRatings = sqliteTable(
  'speaking_ratings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id').notNull(),
    rating: text('rating', { enum: SPEAKING_RATING_NAMES }).notNull(),
    ratedAt: text('rated_at').notNull(),
  },
  (t) => [index('idx_speaking_ratings_item').on(t.itemId, t.ratedAt)],
);

/** Days on which the daily goal was met — input to the streak calc. */
export const goalDays = sqliteTable('goal_days', {
  day: text('day').primaryKey(),
});

/** Simple key/value settings (currently just the daily N choice). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Default used when no `daily_n` setting exists yet. */
export const DEFAULT_EASE = 2.5;
export const EPOCH_DUE = sql`'1970-01-01T00:00:00.000Z'`;

export type NewCardState = typeof cardStates.$inferInsert;
export type CardStateSelect = typeof cardStates.$inferSelect;
export type NewReviewLog = typeof reviewLogs.$inferInsert;
export type ReviewLogSelect = typeof reviewLogs.$inferSelect;
export type NewUnitStep = typeof unitSteps.$inferInsert;
export type UnitStepSelect = typeof unitSteps.$inferSelect;
export type NewCheckpointAttempt = typeof checkpointAttempts.$inferInsert;
export type CheckpointAttemptSelect = typeof checkpointAttempts.$inferSelect;
export type NewSpeakingRating = typeof speakingRatings.$inferInsert;
export type NewGoalDay = typeof goalDays.$inferInsert;
export type NewSetting = typeof settings.$inferInsert;
