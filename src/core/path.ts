/**
 * Unit path (locked/unlocked/passed) and the Continue router: what the
 * learner should do next.
 */

export type UnitStep = 'words' | 'grammar' | 'useit' | 'checkpoint';
export const UNIT_STEPS: readonly UnitStep[] = ['words', 'grammar', 'useit', 'checkpoint'];

export type UnitStatus = 'passed' | 'unlocked' | 'locked';

/**
 * Unit 1 is always unlocked; any other unit unlocks once the highest
 * passed unit is at least one below it. Test-out means "passed" doesn't
 * require every lower unit to be passed too, so `highestPassed` (not a
 * count) drives the next unlock.
 */
export function unitStatus(unit: number, passedUnits: ReadonlySet<number>): UnitStatus {
  if (passedUnits.has(unit)) return 'passed';
  const highestPassed = passedUnits.size ? Math.max(...passedUnits) : 0;
  if (unit === 1 || unit <= highestPassed + 1) return 'unlocked';
  return 'locked';
}

/**
 * The learner's current unit for the Continue router: the unit right after
 * the highest one ever passed, or unit 1 when none has been passed yet.
 * Test-out can leave lower units unlocked-but-not-passed on the path map
 * (see `unitStatus`), but Continue must never route backwards into them —
 * so this is driven by the highest passed unit, not "the lowest unlocked
 * one". Returns null once that number exceeds the authored content
 * (`totalUnits`) — nothing to route to yet.
 */
export function currentUnitNumber(passedUnits: ReadonlySet<number>, totalUnits: number): number | null {
  const highestPassed = passedUnits.size ? Math.max(...passedUnits) : 0;
  const next = highestPassed + 1;
  return next <= totalUnits ? next : null;
}

export interface UnitProgress {
  unit: number;
  /** Ids of this unit's items already introduced (Words step, batched by newItemsAllowed). */
  introducedItemIds: ReadonlySet<string>;
  /** All item ids belonging to this unit. */
  totalItemIds: string[];
  /** Grammar step finished once (this is also when its drill cards are created). */
  grammarDone: boolean;
  /** Use-it step (dialogue/comprehension/record-and-compare) finished once. */
  useitDone: boolean;
  checkpointPassed: boolean;
}

export function wordsStepComplete(progress: Pick<UnitProgress, 'introducedItemIds' | 'totalItemIds'>): boolean {
  return progress.totalItemIds.length > 0 && progress.totalItemIds.every((id) => progress.introducedItemIds.has(id));
}

export function unitStepStatus(progress: UnitProgress): Record<UnitStep, boolean> {
  return {
    words: wordsStepComplete(progress),
    grammar: progress.grammarDone,
    useit: progress.useitDone,
    checkpoint: progress.checkpointPassed,
  };
}

/** The unit's first incomplete step in fixed order, or null once all four are done. */
export function firstIncompleteStep(progress: UnitProgress): UnitStep | null {
  const status = unitStepStatus(progress);
  return UNIT_STEPS.find((step) => !status[step]) ?? null;
}

export type NextAction =
  | { kind: 'review'; count: number }
  | { kind: 'step'; unit: number; step: UnitStep }
  | { kind: 'rest'; reason: 'goal-met' | 'backlog' }
  | { kind: 'exit-test' }
  | { kind: 'done' };

export interface PathState {
  /** Size of the (already capped) due queue. */
  dueCount: number;
  reviewCap: number;
  /** Reviews already done today; once this reaches reviewCap, review stops routing even with cards still due. */
  reviewedToday: number;
  /** units.length — never hard-code 10. */
  totalUnits: number;
  passedUnits: ReadonlySet<number>;
  /** The learner's current unit's progress, or null once every unit is passed. */
  currentUnit: UnitProgress | null;
  /** From core/daily.ts newItemsAllowed(); 0 means Words is paused today. */
  newItemsAllowedToday: number;
  goalMetToday: boolean;
  exitTestPassed: boolean;
  /** True once enough units are authored (content/index.ts A1_UNIT_COUNT)
   *  for the A1 exit test to make sense; false just yields 'done' instead
   *  ("more units coming") once the last authored unit is passed. */
  exitTestAvailable: boolean;
}

/**
 * Review due cards first, up to today's review cap; otherwise the current
 * unit's next incomplete step (or 'rest' if that step is Words and new
 * items are paused today); otherwise the A1 exit test once the last unit
 * is passed (and the full curriculum is authored); otherwise done. Once
 * reviewedToday reaches reviewCap, review stops being offered even with
 * cards still due — it falls through to the unit step logic (still gated
 * by newItemsAllowedToday).
 */
export function nextAction(state: PathState): NextAction {
  if (state.dueCount > 0 && state.reviewedToday < state.reviewCap) {
    return { kind: 'review', count: Math.min(state.dueCount, state.reviewCap - state.reviewedToday) };
  }

  if (state.currentUnit) {
    const step = firstIncompleteStep(state.currentUnit);
    if (step != null) {
      if (step === 'words' && state.newItemsAllowedToday <= 0) {
        return { kind: 'rest', reason: state.goalMetToday ? 'goal-met' : 'backlog' };
      }
      return { kind: 'step', unit: state.currentUnit.unit, step };
    }
  }

  if (state.exitTestAvailable && state.passedUnits.has(state.totalUnits) && !state.exitTestPassed) {
    return { kind: 'exit-test' };
  }

  return { kind: 'done' };
}
