/**
 * Shared data loader for the A1 path: turns the progress DB + bundled
 * content into a `PathState` (for `nextAction`) plus the per-unit rows the
 * Home path map renders. Not part of the tested engine (src/core/*) —
 * this is IO orchestration over already-tested pure functions, used by
 * Home, Review and the unit-step screens so goal/streak recompute stays
 * in one place.
 */

import type * as SQLite from 'expo-sqlite';
import { units, itemsForUnit, A1_UNIT_COUNT } from '../../content';
import {
  currentUnitNumber,
  unitStatus,
  unitStepStatus,
  UNIT_STEPS,
  type UnitProgress,
  type UnitStatus,
  type UnitStep,
} from '../../core/path';
import { newItemsAllowed, isGoalMet } from '../../core/daily';
import {
  loadCardStates,
  loadDueCardStates,
  reviewedToday,
  introducedToday,
  getDailyN,
  passedUnits,
  exitTestPassed,
  completedSteps,
  markGoalDay,
  localDay,
} from '../../db/progress';
import type { PathState } from '../../core/path';

export const REVIEW_CAP = 60;

export interface UnitRow {
  unit: number;
  status: UnitStatus;
  steps: Record<UnitStep, boolean>;
}

export interface PathData {
  path: PathState;
  unitRows: UnitRow[];
  dailyN: number;
  reviewedTodayCount: number;
  introducedTodayCount: number;
  /** Raw (uncapped) due count — the real backlog size. */
  dueRawCount: number;
}

const sortedUnits = () => [...units].sort((a, b) => a.unit - b.unit);

async function buildUnitProgress(
  db: SQLite.SQLiteDatabase,
  unitNum: number,
  introducedRecallIds: Set<string>,
  passed: Set<number>,
): Promise<UnitProgress> {
  const totalItemIds = itemsForUnit(unitNum).map((i) => i.id);
  const introducedItemIds = new Set(totalItemIds.filter((id) => introducedRecallIds.has(id)));
  const steps = await completedSteps(db, unitNum);
  return {
    unit: unitNum,
    introducedItemIds,
    totalItemIds,
    grammarDone: steps.includes('grammar'),
    useitDone: steps.includes('useit'),
    checkpointPassed: passed.has(unitNum),
  };
}

export async function loadPathData(db: SQLite.SQLiteDatabase, now: Date = new Date()): Promise<PathData> {
  const [cardStates, dueRows, reviewedTodayCount, introducedTodayCount, dailyN, passed, exitPassed] =
    await Promise.all([
      loadCardStates(db),
      loadDueCardStates(db, now),
      reviewedToday(db, now),
      introducedToday(db, now),
      getDailyN(db),
      passedUnits(db),
      exitTestPassed(db),
    ]);
  const introducedRecallIds = new Set(
    cardStates.filter((c) => c.cardType === 'recall').map((c) => c.itemId),
  );

  const unitProgresses = await Promise.all(
    sortedUnits().map((u) => buildUnitProgress(db, u.unit, introducedRecallIds, passed)),
  );
  const unitRows: UnitRow[] = unitProgresses.map((p) => ({
    unit: p.unit,
    status: unitStatus(p.unit, passed),
    steps: unitStepStatus(p),
  }));

  const currentNum = currentUnitNumber(passed, units.length);
  const currentUnit = currentNum != null ? (unitProgresses.find((p) => p.unit === currentNum) ?? null) : null;

  const dueRawCount = dueRows.length;
  const cappedDueCount = Math.min(dueRawCount, REVIEW_CAP);
  const newItemsAllowedToday = newItemsAllowed({
    dueCount: dueRawCount,
    cap: REVIEW_CAP,
    introducedToday: introducedTodayCount,
    dailyN,
  });
  const newAvailable = currentUnit ? currentUnit.totalItemIds.length - currentUnit.introducedItemIds.size : 0;
  const goalMetToday = isGoalMet({
    dueRemaining: dueRawCount,
    reviewedToday: reviewedTodayCount,
    cap: REVIEW_CAP,
    introducedToday: introducedTodayCount,
    dailyN,
    newAvailable,
  });

  const path: PathState = {
    dueCount: cappedDueCount,
    reviewCap: REVIEW_CAP,
    reviewedToday: reviewedTodayCount,
    totalUnits: units.length,
    passedUnits: passed,
    currentUnit,
    newItemsAllowedToday,
    goalMetToday,
    exitTestPassed: exitPassed,
    exitTestAvailable: units.length >= A1_UNIT_COUNT,
  };

  return { path, unitRows, dailyN, reviewedTodayCount, introducedTodayCount, dueRawCount };
}

/** The unit's first incomplete step in fixed order, from a UnitRow's step ticks. */
export function firstIncompleteStepFromRow(row: UnitRow): UnitStep | null {
  return UNIT_STEPS.find((step) => !row.steps[step]) ?? null;
}

/**
 * Recompute today's goal and mark it met if so. Call after any review
 * answer or Words-step introduction (spec: goal/streak recompute on every
 * such event, not just at session end).
 */
export async function checkAndMarkGoal(db: SQLite.SQLiteDatabase, now: Date = new Date()): Promise<boolean> {
  const { path } = await loadPathData(db, now);
  if (path.goalMetToday) await markGoalDay(db, localDay(now));
  return path.goalMetToday;
}
