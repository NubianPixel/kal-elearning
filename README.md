# KAL e-Learning 🦁

A mobile app that teaches a 7-year-old English-speaking child **Setswana**,
with a parent-admin content & progress system. Built entirely on
open-source / free-tier tools — **zero budget, zero paid services, fully
offline**.

## Stack

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo (TypeScript, SDK 57) |
| Storage | Local SQLite (`expo-sqlite`) — offline-first, no network needed |
| Audio | `expo-av` — pronunciation clips recorded by the parent, stored on-device |
| Spaced repetition | SM-2, implemented client-side (`src/core/sm2.ts`) — deterministic, explainable, no ML infra |
| Tests | Jest + jest-expo (pure logic unit-tested) |

## Run it

```bash
npm install
npm start          # Expo dev server — scan the QR with Expo Go
npm test           # unit tests (SM-2 scheduler, streaks, milestones)
npm run typecheck  # strict TypeScript check
```

## Screens

1. **Home (child)** — one giant "Play & Learn!" button + streak display; parent zone is small and out of the way.
2. **Review (child)** — audio-first flashcards: the recorded clip plays automatically, the child taps one of four big English meaning buttons. Failed cards re-queue in-session; session ends with praise + score.
3. **Dashboard (parent)** — words mastered / learning, day streak, 30-day accuracy, minutes practised, milestone progress bars.
4. **Admin (parent)** — full CRUD for vocabulary (word, English meaning, category, difficulty) plus one-tap 🎤 recording and preview of pronunciation clips.

## Architecture notes

- **Multi-language by data, not code**: `languages` is a first-class table;
  every content table is keyed by `language_id` and the review engine
  (`src/db/repositories.ts`) never references a specific language. Adding a
  second language = one `INSERT` via `createLanguage()` — no schema or
  engine changes.
- **Pure core**: `src/core/` (types, SM-2, progress/streak/milestones) has
  no I/O and is fully unit-tested (`__tests__/`).
- **Privacy**: no PII collected, no accounts, no analytics, no trackers.
  All data lives in local SQLite on the device.
- **Out of scope for v1** (per project prompt): ML personalization, sync
  backend, multi-child households, ads/IAP, speech recognition.

## Mastery model

A word is *mastered* after **3 consecutive correct reviews** with a
schedule interval of **21+ days** (SM-2: 1d → 6d → interval × ease).
Milestones at 5/10/25/50/100 mastered words.

## Project phases (as delivered)

- ✅ Phase 1 — data model, SQLite schema, SM-2 scheduler + unit tests
- ✅ Phase 2 — admin content-entry flow with audio recording
- ✅ Phase 3 — child flashcard review UI wired to the scheduler
- ✅ Phase 4 — progress tracking + parent dashboard
- ⏸ Phase 5 (deferred) — optional backend sync service
