# KAL e-Learning 🦁

A mobile app that teaches **Setswana** to any beginner (all ages), through
a structured **A1 curriculum** — units of Words → Grammar → Use it →
Checkpoint, spaced repetition, and a checkpoint-gated unit path toward the
CEFR A1 badge. Built entirely on open-source / free-tier tools — **zero
budget, zero paid services, fully offline, no accounts**.

See `documents/designs/2026-09-15-a1-curriculum-redesign.md` for the full
design decisions this app implements.

## Stack

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo (TypeScript, SDK 57) |
| Storage | Local SQLite (`expo-sqlite`) — offline-first, no network needed |
| Audio | `expo-audio` — content clips + record-and-compare pronunciation practice, never uploaded |
| Spaced repetition | SM-2 per card (listen + recall per word), implemented client-side (`src/core/sm2.ts`) |
| Content | Authored in a Google Sheet, exported as CSV into `content/a1/`, packed into the app at build time |
| Tests | Jest + jest-expo (pure logic unit-tested) |

## Run it

```bash
npm install
npm run content    # validate content/a1/*.csv + media, build src/content/a1.json
npm start          # Expo dev server — scan the QR with Expo Go
npx jest           # unit tests (SM-2, daily pacing, checkpoint, path routing, typing)
npx tsc --noEmit   # strict TypeScript check
```

## App shell

Four tabs: **Home** (Continue button + unit path map), **Practice**
(Mistakes / Flashcards / Typing — free practice, never affects SRS or the
daily goal), **Library** (searchable word browser + unlocked-unit story
replays), **Progress** (unit/word stats, checkpoint badges, daily-goal
setting, JSON export/import).

## Architecture notes

- **Content is data, not code**: `content/a1/*.csv` (units, items, grammar,
  dialogues, questions) is validated and packed by `npm run content` into
  `src/content/a1.json`; the app reads it read-only via `src/content/index.ts`.
- **Pure core**: `src/core/` (SM-2, SRS grading, daily pacing, unit path/
  routing, checkpoint scoring, typing/recall grading) has no I/O and is
  unit-tested in `__tests__/`.
- **Progress storage**: `src/db/progress.ts` + `progressSchema.ts` — one
  SQLite database per device, separate from bundled content. No migration
  from any previous version.
- **Privacy**: no accounts, no network, no analytics. Speaking recordings
  are temp files, deleted right after rating (or on app background); never
  stored in the database or included in export.

## Mastery model

A word counts as *mastered* once **both** its listen and recall cards
survive 3 consecutive correct reviews with a schedule interval of 21+ days
(SM-2: 1d → 6d → interval × ease). Unit checkpoints (and the eventual A1
exit test) require ≥80% overall and ≥60% per skill to pass and unlock the
next unit.
