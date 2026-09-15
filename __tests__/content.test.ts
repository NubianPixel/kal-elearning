// The content pipeline modules (scripts/content/*.ts) use explicit `.ts`
// import extensions for Node's native type stripping, which this project's
// tsconfig doesn't allow for `import` statements (see tsconfig.json's
// `scripts` exclude comment). So this test reaches them via `require()`
// instead, which TypeScript treats as an ordinary `(id: string) => any`
// call and doesn't extension-check. `__dirname` is a real Jest/Node
// runtime global but isn't declared by this project's types, hence the
// local ambient declaration below.
declare const __dirname: string;

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../scripts/content/csv.ts');
const { validateContent } = require('../scripts/content/validate.ts');

describe('parseCsv', () => {
  it('parses plain rows into header-keyed records', () => {
    const { header, rows } = parseCsv('a,b\n1,2\n3,4\n');
    expect(header).toEqual(['a', 'b']);
    expect(rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });

  it('handles quoted fields with embedded commas', () => {
    const { rows } = parseCsv('a,b\n"hello, world",2\n');
    expect(rows[0]).toEqual({ a: 'hello, world', b: '2' });
  });

  it('handles quoted fields with embedded newlines', () => {
    const { rows } = parseCsv('a,b\n"line one\nline two",2\n');
    expect(rows[0].a).toBe('line one\nline two');
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    const { rows } = parseCsv('a\n"she said ""hi"""\n');
    expect(rows[0].a).toBe('she said "hi"');
  });

  it('handles CRLF line endings', () => {
    const { header, rows } = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
    expect(header).toEqual(['a', 'b']);
    expect(rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });

  it('strips a leading UTF-8 BOM', () => {
    const { header, rows } = parseCsv('﻿a,b\n1,2\n');
    expect(header).toEqual(['a', 'b']);
    expect(rows[0]).toEqual({ a: '1', b: '2' });
  });

  it('returns empty header/rows for empty input', () => {
    expect(parseCsv('')).toEqual({ header: [], rows: [] });
  });
});

// ---------- validateContent ----------

function csv(header: string[], rows: Record<string, string>[]) {
  return { header, rows };
}

function baseTabs() {
  return {
    units: csv(
      ['unit', 'title_setswana', 'title_english', 'can_do', 'grammar_title'],
      [{ unit: '1', title_setswana: 'Dumela', title_english: 'Greetings', can_do: 'Greet', grammar_title: 'Address' }],
    ),
    items: csv(
      ['id', 'unit', 'order', 'kind', 'setswana', 'setswana_alt', 'english', 'hint', 'pos', 'noun_class', 'plural', 'image', 'note'],
      [
        {
          id: 'a1-u01-w001', unit: '1', order: '1', kind: 'word', setswana: 'Dumela',
          setswana_alt: '', english: 'hello', hint: '', pos: 'verb', noun_class: '', plural: '', image: '', note: '',
        },
      ],
    ),
    grammar: csv(
      ['unit', 'order', 'type', 'text_or_setswana', 'english'],
      [{ unit: '1', order: '1', type: 'text', text_or_setswana: 'Some note.', english: '' }],
    ),
    dialogues: csv(
      ['id', 'unit', 'order', 'speaker', 'setswana', 'english'],
      [{ id: 'a1-u01-d1-l01', unit: '1', order: '1', speaker: 'A', setswana: 'Dumela.', english: 'Hello.' }],
    ),
    questions: csv(
      ['id', 'unit', 'skill', 'use', 'format', 'prompt', 'answer', 'answer_alt', 'distractors', 'explanation'],
      [
        {
          id: 'a1-u01-q001', unit: '1', skill: 'grammar', use: 'drill', format: 'choice',
          prompt: 'Pick hello', answer: 'Dumela', answer_alt: '', distractors: 'Sala sentle|Tsamaya sentle', explanation: '',
        },
      ],
    ),
  };
}

const noMedia = { audioIds: new Set<string>(), imageFiles: new Set<string>() };

describe('validateContent', () => {
  it('accepts a well-formed minimal set of tabs (only missing-audio warnings)', () => {
    const { errors, warnings } = validateContent(baseTabs(), noMedia);
    expect(errors).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0); // no audio on disk
  });

  it('catches a duplicate id', () => {
    const tabs = baseTabs();
    tabs.items.rows.push({ ...tabs.items.rows[0] });
    const { errors } = validateContent(tabs, noMedia);
    expect(errors.some((e: string) => e.includes('duplicate id'))).toBe(true);
  });

  it('catches a bad enum value', () => {
    const tabs = baseTabs();
    tabs.items.rows[0].kind = 'sentence';
    const { errors } = validateContent(tabs, noMedia);
    expect(errors.some((e: string) => e.includes('kind "sentence"'))).toBe(true);
  });

  it('catches a unit mismatch between id and unit column', () => {
    const tabs = baseTabs();
    tabs.items.rows[0].unit = '2';
    const { errors } = validateContent(tabs, noMedia);
    expect(errors.some((e: string) => e.includes('implies unit 1 but row\'s unit column is 2'))).toBe(true);
  });

  it('catches a choice question without at least 2 distractors', () => {
    const tabs = baseTabs();
    tabs.questions.rows[0].distractors = 'Sala sentle';
    const { errors } = validateContent(tabs, noMedia);
    expect(errors.some((e: string) => e.includes('at least 2 distractors'))).toBe(true);
  });

  it('catches a row referencing a unit missing from units.csv', () => {
    const tabs = baseTabs();
    tabs.items.rows[0].unit = '9';
    tabs.items.rows[0].id = 'a1-u09-w001';
    const { errors } = validateContent(tabs, noMedia);
    expect(errors.some((e: string) => e.includes('not in units.csv'))).toBe(true);
  });

  it('catches a reading question in a unit with no dialogue', () => {
    const tabs = baseTabs();
    tabs.dialogues.rows = [];
    tabs.questions.rows[0].skill = 'reading';
    tabs.questions.rows[0].format = 'type';
    tabs.questions.rows[0].distractors = '';
    const { errors } = validateContent(tabs, noMedia);
    expect(errors.some((e: string) => e.includes('no dialogue'))).toBe(true);
  });
});

// ---------- the real Unit 1 content ----------

describe('content/a1 CSVs', () => {
  it('validate with zero errors', () => {
    const dir = path.resolve(__dirname, '..', 'content', 'a1');
    const read = (name: string) => parseCsv(fs.readFileSync(path.join(dir, `${name}.csv`), 'utf8'));

    const tabs = {
      units: read('units'),
      items: read('items'),
      grammar: read('grammar'),
      dialogues: read('dialogues'),
      questions: read('questions'),
    };

    const audioDir = path.resolve(__dirname, '..', 'content', 'media', 'audio');
    const imageDir = path.resolve(__dirname, '..', 'content', 'media', 'images');
    const listNonHidden = (d: string) =>
      fs.existsSync(d) ? fs.readdirSync(d).filter((f: string) => !f.startsWith('.')) : [];
    const audioIds = new Set(listNonHidden(audioDir).map((f: string) => f.slice(0, f.lastIndexOf('.')) || f));
    const imageFiles = new Set(listNonHidden(imageDir));

    const { errors } = validateContent(tabs, { audioIds, imageFiles });
    expect(errors).toEqual([]);
  });
});
