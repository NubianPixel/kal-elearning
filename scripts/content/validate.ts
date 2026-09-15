/**
 * Pure validation of the parsed A1 content tabs (units/items/grammar/
 * dialogues/questions). No file I/O here — media existence is checked
 * against filename sets the caller already read from disk, so this stays
 * a pure function of its inputs.
 */

import type { ParsedCsv } from './csv.ts';

export interface ContentTabs {
  units: ParsedCsv;
  items: ParsedCsv;
  grammar: ParsedCsv;
  dialogues: ParsedCsv;
  questions: ParsedCsv;
}

export interface MediaFiles {
  /**
   * Filenames in content/media/audio with their extension stripped, e.g. a
   * file "a1-u01-w001.wav" contributes "a1-u01-w001". Source recordings can
   * be any format, so audio presence is checked by id, not by extension.
   */
  audioIds: Set<string>;
  /** Exact filenames present in content/media/images, e.g. "a1-u03-w012.jpg". */
  imageFiles: Set<string>;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const HEADERS = {
  units: ['unit', 'title_setswana', 'title_english', 'can_do', 'grammar_title'],
  items: [
    'id', 'unit', 'order', 'kind', 'setswana', 'setswana_alt', 'english',
    'hint', 'pos', 'noun_class', 'plural', 'image', 'note',
  ],
  grammar: ['unit', 'order', 'type', 'text_or_setswana', 'english'],
  dialogues: ['id', 'unit', 'order', 'speaker', 'setswana', 'english'],
  questions: [
    'id', 'unit', 'skill', 'use', 'format', 'prompt', 'answer', 'answer_alt',
    'distractors', 'explanation',
  ],
} as const;

const KIND_VALUES = new Set(['word', 'phrase']);
const POS_VALUES = new Set(['noun', 'verb', 'pronoun', 'number', 'adverb', 'phrase', 'other']);
const GRAMMAR_TYPE_VALUES = new Set(['text', 'example']);
const SKILL_VALUES = new Set(['grammar', 'reading']);
const USE_VALUES = new Set(['drill', 'checkpoint']);
const FORMAT_VALUES = new Set(['choice', 'type']);

const ITEM_ID_RE = /^a1-u(\d{2})-w\d{3}$/;
const DIALOGUE_ID_RE = /^a1-u(\d{2})-d\d+-l\d{2}$/;
const QUESTION_ID_RE = /^a1-u(\d{2})-q\d{3}$/;

function checkHeader(name: string, actual: string[], expected: readonly string[], errors: string[]) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((c) => !actualSet.has(c));
  const extra = actual.filter((c) => !expectedSet.has(c));
  if (missing.length > 0) errors.push(`${name}.csv: missing column(s) ${missing.join(', ')}`);
  if (extra.length > 0) errors.push(`${name}.csv: unexpected column(s) ${extra.join(', ')}`);
}

/** unit column is a plain integer string like "1", not "01". */
function unitNumber(row: Record<string, string>): number | null {
  const raw = (row.unit ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

export function validateContent(tabs: ContentTabs, media: MediaFiles): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  checkHeader('units', tabs.units.header, HEADERS.units, errors);
  checkHeader('items', tabs.items.header, HEADERS.items, errors);
  checkHeader('grammar', tabs.grammar.header, HEADERS.grammar, errors);
  checkHeader('dialogues', tabs.dialogues.header, HEADERS.dialogues, errors);
  checkHeader('questions', tabs.questions.header, HEADERS.questions, errors);

  const unitNumbers = new Set<number>();
  for (const row of tabs.units.rows) {
    const n = unitNumber(row);
    if (n != null) unitNumbers.add(n);
  }

  function requireKnownUnit(tag: string, row: Record<string, string>, errors: string[]): number | null {
    const n = unitNumber(row);
    if (n == null) {
      errors.push(`${tag}: unit "${row.unit}" is not a valid unit number`);
      return null;
    }
    if (!unitNumbers.has(n)) {
      errors.push(`${tag}: references unit ${n}, which is not in units.csv`);
    }
    return n;
  }

  function requireIdUnitMatch(tag: string, id: string, re: RegExp, rowUnit: number | null, errors: string[]) {
    const m = re.exec(id);
    if (m == null) return; // format already reported separately
    const idUnit = parseInt(m[1], 10);
    if (rowUnit != null && idUnit !== rowUnit) {
      errors.push(`${tag}: id "${id}" implies unit ${idUnit} but row's unit column is ${rowUnit}`);
    }
  }

  // ---------- items ----------
  const allIds = new Map<string, string>(); // id -> which tab it first appeared in

  for (const [i, row] of tabs.items.rows.entries()) {
    const tag = `items.csv row ${i + 2}`; // +2: 1-indexed + header row
    const id = row.id ?? '';
    if (!ITEM_ID_RE.test(id)) {
      errors.push(`${tag}: id "${id}" does not match a1-uNN-wNNN`);
    } else {
      if (allIds.has(id)) {
        errors.push(`${tag}: duplicate id "${id}" (also in ${allIds.get(id)})`);
      } else {
        allIds.set(id, 'items.csv');
      }
    }

    const rowUnit = requireKnownUnit(tag, row, errors);
    requireIdUnitMatch(tag, id, ITEM_ID_RE, rowUnit, errors);

    if (!(row.setswana ?? '').trim()) errors.push(`${tag}: setswana is required`);
    if (!(row.english ?? '').trim()) errors.push(`${tag}: english is required`);

    if (row.kind && !KIND_VALUES.has(row.kind)) {
      errors.push(`${tag}: kind "${row.kind}" is not one of ${[...KIND_VALUES].join('/')}`);
    }
    if (row.pos && !POS_VALUES.has(row.pos)) {
      errors.push(`${tag}: pos "${row.pos}" is not one of ${[...POS_VALUES].join('/')}`);
    }

    if ((row.image ?? '').trim() && !media.imageFiles.has(row.image.trim())) {
      warnings.push(`${tag}: image "${row.image}" not found in content/media/images`);
    }
    if (id && !media.audioIds.has(id)) {
      warnings.push(`${tag}: missing audio for ${id} in content/media/audio`);
    }
    if ((row.plural ?? '').trim() && id && !media.audioIds.has(`${id}-pl`)) {
      warnings.push(`${tag}: missing plural audio for ${id}-pl in content/media/audio`);
    }
  }

  // ---------- grammar ----------
  for (const [i, row] of tabs.grammar.rows.entries()) {
    const tag = `grammar.csv row ${i + 2}`;
    requireKnownUnit(tag, row, errors);
    if (row.type && !GRAMMAR_TYPE_VALUES.has(row.type)) {
      errors.push(`${tag}: type "${row.type}" is not one of ${[...GRAMMAR_TYPE_VALUES].join('/')}`);
    }
    if (!(row.text_or_setswana ?? '').trim()) {
      errors.push(`${tag}: text_or_setswana is required`);
    }
  }

  // ---------- dialogues ----------
  const unitsWithDialogue = new Set<number>();
  for (const [i, row] of tabs.dialogues.rows.entries()) {
    const tag = `dialogues.csv row ${i + 2}`;
    const id = row.id ?? '';
    if (!DIALOGUE_ID_RE.test(id)) {
      errors.push(`${tag}: id "${id}" does not match a1-uNN-dN-lNN`);
    } else {
      if (allIds.has(id)) {
        errors.push(`${tag}: duplicate id "${id}" (also in ${allIds.get(id)})`);
      } else {
        allIds.set(id, 'dialogues.csv');
      }
    }

    const rowUnit = requireKnownUnit(tag, row, errors);
    requireIdUnitMatch(tag, id, DIALOGUE_ID_RE, rowUnit, errors);
    if (rowUnit != null) unitsWithDialogue.add(rowUnit);

    if (!(row.setswana ?? '').trim()) errors.push(`${tag}: setswana is required`);
    if (!(row.english ?? '').trim()) errors.push(`${tag}: english is required`);

    if (id && !media.audioIds.has(id)) {
      warnings.push(`${tag}: missing audio for ${id} in content/media/audio`);
    }
  }

  // ---------- questions ----------
  for (const [i, row] of tabs.questions.rows.entries()) {
    const tag = `questions.csv row ${i + 2}`;
    const id = row.id ?? '';
    if (!QUESTION_ID_RE.test(id)) {
      errors.push(`${tag}: id "${id}" does not match a1-uNN-qNNN`);
    } else {
      if (allIds.has(id)) {
        errors.push(`${tag}: duplicate id "${id}" (also in ${allIds.get(id)})`);
      } else {
        allIds.set(id, 'questions.csv');
      }
    }

    const rowUnit = requireKnownUnit(tag, row, errors);
    requireIdUnitMatch(tag, id, QUESTION_ID_RE, rowUnit, errors);

    if (!(row.prompt ?? '').trim()) errors.push(`${tag}: prompt is required`);
    if (!(row.answer ?? '').trim()) errors.push(`${tag}: answer is required`);

    if (row.skill && !SKILL_VALUES.has(row.skill)) {
      errors.push(`${tag}: skill "${row.skill}" is not one of ${[...SKILL_VALUES].join('/')}`);
    }
    if (row.use && !USE_VALUES.has(row.use)) {
      errors.push(`${tag}: use "${row.use}" is not one of ${[...USE_VALUES].join('/')}`);
    }
    if (row.format && !FORMAT_VALUES.has(row.format)) {
      errors.push(`${tag}: format "${row.format}" is not one of ${[...FORMAT_VALUES].join('/')}`);
    }

    const distractors = (row.distractors ?? '').trim();
    const distractorList = distractors ? distractors.split('|').filter((d) => d.trim()) : [];
    if (row.format === 'choice' && distractorList.length < 2) {
      errors.push(`${tag}: choice question needs at least 2 distractors, has ${distractorList.length}`);
    }
    if (row.format === 'type' && distractorList.length > 0) {
      errors.push(`${tag}: type question must not have distractors`);
    }

    if (row.skill === 'reading' && rowUnit != null && !unitsWithDialogue.has(rowUnit)) {
      errors.push(`${tag}: reading question in unit ${rowUnit}, which has no dialogue`);
    }
  }

  return { errors, warnings };
}
