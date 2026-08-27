# KAL e-Learning — Setswana Teaching App Prompt

Optimized build prompt for a mobile app that teaches a 7-year-old English-speaking
child Setswana, with a parent-admin content/progress system, on a zero-budget
open-source stack.

## Full Version

```
Use the blueprint skill to plan: "Setswana-teaching mobile app for a 7-year-old
English-speaking child, with a parent-admin content and progress system, built
entirely on open-source/free-tier tools (zero budget), architected so additional
languages can be added later without a rewrite."

Before executing, have the blueprint resolve these open questions:
1. Personalization: is "the model should learn what we teach it" satisfied by
   admin-authored content + a spaced-repetition scheduler (SM-2/Leitner —
   recommended: zero ML infra, deterministic, explainable), or do you want
   actual adaptive ML re-ranking of content? Default to spaced repetition
   unless told otherwise.
2. Pronunciation audio: no free machine TTS currently supports Setswana.
   Confirm audio will be short clips recorded by an admin (parent) per
   vocabulary entry, stored as app assets — not synthesized.
3. Platforms & hosting: mobile app for iOS + Android via Expo (React Native,
   open source, one codebase, free EAS build tier). Data layer: local-first
   SQLite (offline-capable, appropriate for a child's app) with an optional
   self-hosted or free-tier sync layer. Confirm which sync/hosting option is
   acceptable, or whether fully local/offline is sufficient for v1.
4. Fluency/success criteria: define concrete milestones (e.g., N vocabulary
   items "mastered" per spaced-repetition interval, streak tracking, category
   completion) instead of an open-ended "until fluent."
5. Child-data privacy: no collection of the child's PII beyond a first
   name/avatar chosen by the parent; all accounts are parent-owned; no
   analytics or third-party trackers.

Tech stack (open source, zero budget):
- Mobile: React Native + Expo (MIT-licensed, free EAS tier for builds)
- Local storage: SQLite via expo-sqlite or WatermelonDB (offline-first
  flashcard/progress data)
- Backend (only if online sync is wanted): Node.js + NestJS or Fastify,
  deployable on a free tier (Render/Fly.io) or self-hosted
- Database: PostgreSQL (or SQLite alone if fully local/offline is acceptable)
- Auth: simple JWT-based parent/admin auth, no paid third-party IdP
- Audio: local device storage, optional self-hosted object storage (e.g.
  MinIO) for recorded pronunciation clips
- Spaced repetition: SM-2 or Leitner implemented client-side — no ML service

Required feature set:
- Admin (parent) CRUD: vocabulary entries — Setswana word/phrase, English
  translation, recorded pronunciation audio, category, difficulty
- Flashcard review queue driven by spaced-repetition scheduling
- Multi-language architecture: `language` is a first-class entity so a second
  language can be added via data only, no schema/code rewrite
- Child-facing UI: large touch targets, minimal text, audio-first, positive
  reinforcement, no ads/IAP/social features
- Progress tracking: per-child stats (words mastered, streak, accuracy, time
  spent), persisted and queryable
- Parent/admin dashboard: view child's progress, manage content, scoped
  strictly to admin — no other privileged features
- Fully functional offline; sync (if implemented) must never block the core
  review flow

Blueprint should generate phases along these lines:
- Phase 1: Data model + content schema (languages, vocabulary entries, review
  history) and spaced-repetition scheduling logic — pure, testable, no UI yet
- Phase 2: Admin content-entry flow (add/edit vocabulary, record/upload audio)
- Phase 3: Child-facing flashcard review UI wired to the scheduler
- Phase 4: Progress tracking + parent dashboard
- Phase 5 (optional, defer unless needed): backend sync service
- Each phase = one PR, with a /verify gate before the next phase starts
- Use /save-session between phases; /resume-session to continue

Acceptance criteria:
- App runs fully offline; no paid service required at any point
- Admin can add a complete vocabulary entry (word, translation, audio,
  category) in under a minute
- Child can complete a full review session by touch/audio alone, without
  needing to read English to navigate
- Progress data (mastery, streaks) is visible to the parent and persists
  across app restarts
- Adding a second language requires new data only, no changes to the review
  engine code

Explicitly out of scope for v1:
- ML-based content generation or NLP-driven personalization
- Multi-child/multi-parent households beyond a single admin account
- In-app purchases, ads, or third-party analytics
- Speech recognition / pronunciation scoring of the child's own voice

Recommended: Opus 5 for the blueprint/planning pass, Sonnet 5 for phase
execution.
```

## Quick Version

```
Use blueprint skill for "Setswana-teaching mobile app, zero-budget open-source
stack, admin-authored flashcards + spaced repetition, offline-first,
multi-language-ready data model, parent progress dashboard." Execute phases
with /verify gates.
```

## Original Draft (for reference)

> You are a senior UI/UX expert, Who has Expert and Senior Level Data Science
> and Expert Software engineering Skills, Build a Mobile Application that Will
> teach my 7 Year Old Son Setswana our Native Language using the data that we
> will feed it using our Admin Writes. He only knows English. It needs to use
> queue cards, translations, Pronuncitions, All the basics until he is fluent,
> It should also be able to track His progress and report back to us His
> parents who have admin level rights, The model should learn all the things
> we teach it, And be able to be taught other languages too, this mobile app
> should be architechturally sound and use only open source solutions to
> develop, because our budget is Zero
