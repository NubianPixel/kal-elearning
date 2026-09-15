/**
 * Content pipeline entry point: reads content/a1/*.csv, validates them,
 * processes new/changed media with ffmpeg, and emits the bundled content
 * the app ships (src/content/a1.json, src/content/media.ts).
 *
 * Run with `npm run content` (plain Node 24, type-stripped — no ts-node,
 * no build step for this script itself). `--strict` turns warnings into
 * errors, useful for CI/the pre-release gate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './content/csv.ts';
import { validateContent } from './content/validate.ts';
import type { ContentTabs } from './content/validate.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'a1');
const AUDIO_SRC_DIR = path.join(ROOT, 'content', 'media', 'audio');
const IMAGE_SRC_DIR = path.join(ROOT, 'content', 'media', 'images');
const AUDIO_OUT_DIR = path.join(ROOT, 'assets', 'content', 'audio');
const IMAGE_OUT_DIR = path.join(ROOT, 'assets', 'content', 'images');
const SRC_CONTENT_DIR = path.join(ROOT, 'src', 'content');

const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const strict = process.argv.includes('--strict');

function readCsv(name: string) {
  const file = path.join(CONTENT_DIR, `${name}.csv`);
  const text = fs.readFileSync(file, 'utf8');
  return parseCsv(text);
}

/** Non-hidden filenames in a directory, or [] if the directory is absent. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
}

function splitPipe(value: string | undefined): string[] {
  const v = (value ?? '').trim();
  return v ? v.split('|').map((s) => s.trim()).filter(Boolean) : [];
}

function orNull(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  return v ? v : null;
}

// ---------- 1. read + validate ----------

const tabs: ContentTabs = {
  units: readCsv('units'),
  items: readCsv('items'),
  grammar: readCsv('grammar'),
  dialogues: readCsv('dialogues'),
  questions: readCsv('questions'),
};

const audioSourceFiles = listFiles(AUDIO_SRC_DIR);
const audioIds = new Set(audioSourceFiles.map((f) => f.slice(0, f.lastIndexOf('.')) || f));
const imageFiles = new Set(listFiles(IMAGE_SRC_DIR));

const { errors, warnings } = validateContent(tabs, { audioIds, imageFiles });

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);

const effectiveErrorCount = errors.length + (strict ? warnings.length : 0);
console.log(
  `\n${errors.length} error(s), ${warnings.length} warning(s)${strict ? ' (--strict: warnings count as errors)' : ''}.`,
);

if (effectiveErrorCount > 0) {
  process.exit(1);
}

// ---------- 2. process media ----------

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function isStale(input: string, output: string): boolean {
  if (!fs.existsSync(output)) return true;
  return fs.statSync(input).mtimeMs > fs.statSync(output).mtimeMs;
}

/** Find a source file in `dir` whose basename (without extension) is `id`. */
function findSource(dir: string, files: string[], id: string): string | null {
  const match = files.find((f) => f.slice(0, f.lastIndexOf('.')) === id);
  return match ? path.join(dir, match) : null;
}

function convertAudio(input: string, output: string) {
  ensureDir(path.dirname(output));
  // Trim leading/trailing silence, normalize loudness, mono AAC.
  execFileSync(
    FFMPEG,
    [
      '-y', '-i', input,
      '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,' +
        'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,' +
        'loudnorm',
      '-ac', '1',
      '-c:a', 'aac',
      output,
    ],
    { stdio: 'inherit' },
  );
}

let webpChecked = false;
function assertWebpSupport() {
  if (webpChecked) return;
  const encoders = execFileSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (!/libwebp/.test(encoders)) {
    console.error(
      'error: this ffmpeg build has no libwebp encoder — install one with webp support ' +
        '(e.g. `brew reinstall ffmpeg`) to process content images.',
    );
    process.exit(1);
  }
  webpChecked = true;
}

function convertImage(input: string, output: string) {
  assertWebpSupport();
  ensureDir(path.dirname(output));
  execFileSync(
    FFMPEG,
    [
      '-y', '-i', input,
      '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease",
      output,
    ],
    { stdio: 'inherit' },
  );
}

const producedAudioIds = new Set<string>();
const producedImageIds = new Set<string>();

for (const row of tabs.items.rows) {
  const id = row.id;
  const src = findSource(AUDIO_SRC_DIR, audioSourceFiles, id);
  if (src) {
    const out = path.join(AUDIO_OUT_DIR, `${id}.m4a`);
    if (isStale(src, out)) convertAudio(src, out);
    producedAudioIds.add(id);
  }
  if (row.plural?.trim()) {
    const plId = `${id}-pl`;
    const plSrc = findSource(AUDIO_SRC_DIR, audioSourceFiles, plId);
    if (plSrc) {
      const out = path.join(AUDIO_OUT_DIR, `${plId}.m4a`);
      if (isStale(plSrc, out)) convertAudio(plSrc, out);
      producedAudioIds.add(plId);
    }
  }
  const image = row.image?.trim();
  if (image && imageFiles.has(image)) {
    const src2 = path.join(IMAGE_SRC_DIR, image);
    const out = path.join(IMAGE_OUT_DIR, `${id}.webp`);
    if (isStale(src2, out)) convertImage(src2, out);
    producedImageIds.add(id);
  }
}

for (const row of tabs.dialogues.rows) {
  const id = row.id;
  const src = findSource(AUDIO_SRC_DIR, audioSourceFiles, id);
  if (src) {
    const out = path.join(AUDIO_OUT_DIR, `${id}.m4a`);
    if (isStale(src, out)) convertAudio(src, out);
    producedAudioIds.add(id);
  }
}

// Only ids whose processed output actually exists on disk get a require().
function existingProducedAudioIds(): string[] {
  return [...producedAudioIds]
    .filter((id) => fs.existsSync(path.join(AUDIO_OUT_DIR, `${id}.m4a`)))
    .sort();
}
function existingProducedImageIds(): string[] {
  return [...producedImageIds]
    .filter((id) => fs.existsSync(path.join(IMAGE_OUT_DIR, `${id}.webp`)))
    .sort();
}

// ---------- 3. emit src/content/a1.json ----------

ensureDir(SRC_CONTENT_DIR);

const bundle = {
  units: tabs.units.rows.map((r) => ({
    unit: Number(r.unit),
    title_setswana: r.title_setswana,
    title_english: r.title_english,
    can_do: r.can_do,
    grammar_title: r.grammar_title,
  })),
  items: tabs.items.rows.map((r) => ({
    id: r.id,
    unit: Number(r.unit),
    order: Number(r.order),
    kind: r.kind,
    setswana: r.setswana,
    setswana_alt: orNull(r.setswana_alt),
    english: splitPipe(r.english),
    hint: orNull(r.hint),
    pos: orNull(r.pos),
    noun_class: orNull(r.noun_class),
    plural: splitPipe(r.plural),
    image: orNull(r.image),
    note: orNull(r.note),
  })),
  grammar: tabs.grammar.rows.map((r) => ({
    unit: Number(r.unit),
    order: Number(r.order),
    type: r.type,
    text_or_setswana: r.text_or_setswana,
    english: orNull(r.english),
  })),
  dialogues: tabs.dialogues.rows.map((r) => ({
    id: r.id,
    unit: Number(r.unit),
    order: Number(r.order),
    speaker: r.speaker,
    setswana: r.setswana,
    english: r.english,
  })),
  questions: tabs.questions.rows.map((r) => ({
    id: r.id,
    unit: Number(r.unit),
    skill: r.skill,
    use: r.use,
    format: r.format,
    prompt: r.prompt,
    answer: r.answer,
    answer_alt: orNull(r.answer_alt),
    distractors: orNull(r.distractors),
    explanation: orNull(r.explanation),
  })),
};

fs.writeFileSync(path.join(SRC_CONTENT_DIR, 'a1.json'), JSON.stringify(bundle, null, 2) + '\n');

// ---------- 4. emit src/content/media.ts ----------

function requireLine(key: string, relPath: string): string {
  return `  '${key}': require('${relPath}') as number,`;
}

const audioLines = existingProducedAudioIds().map((id) =>
  requireLine(id, `../../assets/content/audio/${id}.m4a`),
);
const imageLines = existingProducedImageIds().map((id) =>
  requireLine(id, `../../assets/content/images/${id}.webp`),
);

const mediaTs = `/**
 * Static require() maps for bundled content media, generated by
 * \`npm run content\` from content/media/{audio,images}. Do not edit by
 * hand — Metro needs literal require() calls (no dynamic paths), so this
 * file lists one per media file that actually exists.
 */

export const audio: Record<string, number> = {
${audioLines.join('\n')}
};

export const images: Record<string, number> = {
${imageLines.join('\n')}
};
`;

fs.writeFileSync(path.join(SRC_CONTENT_DIR, 'media.ts'), mediaTs);

console.log(
  `Wrote src/content/a1.json and src/content/media.ts ` +
    `(${existingProducedAudioIds().length} audio, ${existingProducedImageIds().length} image files bundled).`,
);
