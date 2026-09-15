/**
 * Checkpoint runner: builds a unit checkpoint (or the A1 exit test, which
 * draws from every unit) and scores results against the pass rule (>=80%
 * overall AND >=60% in every skill that had questions).
 */

import { itemsForUnit, questionsForUnit, units, type Item, type Question } from '../content';
import { buildListeningQuestion, buildRecallQuestion, type ListeningQuestion, type RecallQuestion } from './questions';

export type Skill = 'listening' | 'recall' | 'grammar' | 'reading';

export const DEFAULT_QUESTIONS_PER_SKILL = 5;
const PASS_OVERALL_PCT = 80;
const PASS_SKILL_PCT = 60;

export type CheckpointQuestion =
  | { skill: 'listening'; question: ListeningQuestion }
  | { skill: 'recall'; question: RecallQuestion }
  | { skill: 'grammar' | 'reading'; question: Question };

export interface Checkpoint {
  /** The unit being tested, or null for the A1 exit test (all units). */
  unit: number | null;
  questions: CheckpointQuestion[];
}

/** Fisher-Yates with an injectable RNG, so tests are deterministic. */
function pickRandom<T>(pool: T[], n: number, rng: () => number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, n));
}

export interface BuildCheckpointOptions {
  /** Questions per skill (default 5); pools smaller than this just contribute what they have. */
  perSkill?: number;
  rng?: () => number;
  /** Items eligible as listening distractors; defaults to the tested units' own items. */
  introducedPool?: Item[];
}

export function buildCheckpoint(unit: number | null, opts: BuildCheckpointOptions = {}): Checkpoint {
  const perSkill = opts.perSkill ?? DEFAULT_QUESTIONS_PER_SKILL;
  const rng = opts.rng ?? Math.random;
  const unitNumbers = unit == null ? units.map((u) => u.unit) : [unit];

  const unitItems = unitNumbers.flatMap((u) => itemsForUnit(u));
  const introducedPool = opts.introducedPool ?? unitItems;
  const authoredCheckpoint = unitNumbers.flatMap((u) => questionsForUnit(u, 'checkpoint'));
  const grammarPool = authoredCheckpoint.filter((q) => q.skill === 'grammar');
  const readingPool = authoredCheckpoint.filter((q) => q.skill === 'reading');

  const listening: CheckpointQuestion[] = pickRandom(unitItems, perSkill, rng)
    .map((item) => buildListeningQuestion(item, introducedPool))
    .filter((q): q is ListeningQuestion => q != null)
    .map((question) => ({ skill: 'listening' as const, question }));

  const recall: CheckpointQuestion[] = pickRandom(unitItems, perSkill, rng).map((item) => ({
    skill: 'recall' as const,
    question: buildRecallQuestion(item),
  }));

  const grammar: CheckpointQuestion[] = pickRandom(grammarPool, perSkill, rng).map((question) => ({
    skill: 'grammar' as const,
    question,
  }));

  const reading: CheckpointQuestion[] = pickRandom(readingPool, perSkill, rng).map((question) => ({
    skill: 'reading' as const,
    question,
  }));

  return { unit, questions: [...listening, ...recall, ...grammar, ...reading] };
}

export interface CheckpointResult {
  skill: Skill;
  /** The generated item (listening/recall) or authored question (grammar/reading) id. */
  refId: string;
  correct: boolean;
}

export interface CheckpointScore {
  overallPct: number;
  perSkillPct: Partial<Record<Skill, number>>;
  passed: boolean;
  missed: CheckpointResult[];
}

/** >=80% overall AND >=60% in every skill that had at least one question. */
export function scoreCheckpoint(results: CheckpointResult[]): CheckpointScore {
  const overallPct = results.length
    ? Math.round((results.filter((r) => r.correct).length / results.length) * 100)
    : 0;

  const bySkill = new Map<Skill, CheckpointResult[]>();
  for (const r of results) {
    const list = bySkill.get(r.skill);
    if (list) list.push(r);
    else bySkill.set(r.skill, [r]);
  }

  const perSkillPct: Partial<Record<Skill, number>> = {};
  for (const [skill, list] of bySkill) {
    perSkillPct[skill] = Math.round((list.filter((r) => r.correct).length / list.length) * 100);
  }

  const passed =
    overallPct >= PASS_OVERALL_PCT && Object.values(perSkillPct).every((pct) => pct >= PASS_SKILL_PCT);

  return { overallPct, perSkillPct, passed, missed: results.filter((r) => !r.correct) };
}
