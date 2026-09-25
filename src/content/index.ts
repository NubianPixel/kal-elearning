/**
 * Typed, read-only view over the bundled A1 content (`a1.json`, produced by
 * `npm run content`). Content is never copied into SQLite — the engine and
 * UI read it from here directly.
 *
 * `setswana_alt` and question `distractors`/`answer_alt` still arrive from
 * the build as raw '|'-separated strings (or null); this module splits
 * them into arrays once so every consumer gets plain string[].
 */

import raw from './a1.json';
import { audio, images } from './media';

/** The A1 curriculum's full size per the design spec — NOT `units.length`
 *  (the authored count so far). Gates the A1 exit test: it's only offered
 *  once this many units exist and the last of them is passed. */
export const A1_UNIT_COUNT = 10;

export interface Unit {
  unit: number;
  titleSetswana: string;
  titleEnglish: string;
  canDo: string;
  grammarTitle: string;
}

export type ItemKind = 'word' | 'phrase';
export type Pos = 'noun' | 'verb' | 'pronoun' | 'number' | 'adverb' | 'phrase' | 'other';

export interface Item {
  id: string;
  unit: number;
  order: number;
  kind: ItemKind;
  setswana: string;
  /** Other accepted spellings. */
  setswanaAlt: string[];
  /** Accepted English meanings; english[0] is the displayed/prompt form. */
  english: string[];
  hint: string | null;
  pos: Pos | null;
  nounClass: string | null;
  plural: string[];
  image: string | null;
  note: string | null;
}

export type GrammarType = 'text' | 'example';

export interface GrammarRow {
  unit: number;
  order: number;
  type: GrammarType;
  textOrSetswana: string;
  english: string | null;
}

export interface DialogueLine {
  id: string;
  unit: number;
  order: number;
  speaker: string;
  setswana: string;
  english: string;
}

export type QuestionSkill = 'grammar' | 'reading';
export type QuestionUse = 'drill' | 'checkpoint';
export type QuestionFormat = 'choice' | 'type';

export interface Question {
  id: string;
  unit: number;
  skill: QuestionSkill;
  use: QuestionUse;
  format: QuestionFormat;
  prompt: string;
  answer: string;
  answerAlt: string[];
  distractors: string[];
  explanation: string | null;
}

function splitPipe(value: string | null | undefined): string[] {
  return value ? value.split('|').map((s) => s.trim()).filter(Boolean) : [];
}

export const units: Unit[] = raw.units.map((u) => ({
  unit: u.unit,
  titleSetswana: u.title_setswana,
  titleEnglish: u.title_english,
  canDo: u.can_do,
  grammarTitle: u.grammar_title,
}));

export const items: Item[] = raw.items.map((r) => ({
  id: r.id,
  unit: r.unit,
  order: r.order,
  kind: r.kind as ItemKind,
  setswana: r.setswana,
  setswanaAlt: splitPipe(r.setswana_alt),
  english: r.english,
  hint: r.hint,
  pos: (r.pos as Pos | null) ?? null,
  nounClass: r.noun_class,
  plural: r.plural,
  image: r.image,
  note: r.note,
}));

export const grammarRows: GrammarRow[] = raw.grammar.map((r) => ({
  unit: r.unit,
  order: r.order,
  type: r.type as GrammarType,
  textOrSetswana: r.text_or_setswana,
  english: r.english,
}));

export const dialogueLines: DialogueLine[] = raw.dialogues.map((r) => ({
  id: r.id,
  unit: r.unit,
  order: r.order,
  speaker: r.speaker,
  setswana: r.setswana,
  english: r.english,
}));

export const questions: Question[] = raw.questions.map((r) => ({
  id: r.id,
  unit: r.unit,
  skill: r.skill as QuestionSkill,
  use: r.use as QuestionUse,
  format: r.format as QuestionFormat,
  prompt: r.prompt,
  answer: r.answer,
  answerAlt: splitPipe(r.answer_alt),
  distractors: splitPipe(r.distractors),
  explanation: r.explanation,
}));

const itemsById = new Map(items.map((i) => [i.id, i]));

/* Content is immutable at runtime, so per-unit views are computed once on
 * demand and cached — Home/Review/Checkpoint resolve the same units every
 * session, and re-filtering + re-sorting the full arrays each call was pure
 * repeated work on the mount path. */

function memoizeByUnit<T>(build: (unit: number) => T[]): (unit: number) => T[] {
  const cache = new Map<number, T[]>();
  return (unit: number) => {
    let value = cache.get(unit);
    if (!value) {
      value = build(unit);
      cache.set(unit, value);
    }
    return value;
  };
}

export const itemsForUnit = memoizeByUnit((unit) =>
  items.filter((i) => i.unit === unit).sort((a, b) => a.order - b.order),
);

export const grammarForUnit = memoizeByUnit((unit) =>
  grammarRows.filter((g) => g.unit === unit).sort((a, b) => a.order - b.order),
);

export const dialogueForUnit = memoizeByUnit((unit) =>
  dialogueLines.filter((d) => d.unit === unit).sort((a, b) => a.order - b.order),
);

/** Questions for a unit, optionally filtered to `use` ('drill' | 'checkpoint'). */
export function questionsForUnit(unit: number, use?: QuestionUse): Question[] {
  if (use === undefined) return allQuestionsByUnit(unit);
  if (use === 'checkpoint') return checkpointQuestionsByUnit(unit);
  return drillQuestionsByUnit(unit);
}

const allQuestionsByUnit = memoizeByUnit((unit) => questions.filter((q) => q.unit === unit));
const checkpointQuestionsByUnit = memoizeByUnit((unit) => questions.filter((q) => q.unit === unit && q.use === 'checkpoint'));
const drillQuestionsByUnit = memoizeByUnit((unit) => questions.filter((q) => q.unit === unit && q.use === 'drill'));

export function itemById(id: string): Item | undefined {
  return itemsById.get(id);
}

/** The item/dialogue-line's audio require() id, or undefined when not bundled. */
export function audioFor(id: string): number | undefined {
  return audio[id];
}

/** The item's image require() id, or undefined when not bundled. */
export function imageFor(id: string): number | undefined {
  return images[id];
}
