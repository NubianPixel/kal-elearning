# KAL e-Learning — Codebase Audit & Improvement Plan

Date: 2026-09-04
Scope: identity, UI, teaching algorithm/pedagogy, and code structure, re-scoped
from "teach a 7-year-old" to "teach any non-Setswana-speaking beginner toward
fluency" (per project owner decision).

## What's already right (keep, don't touch)

- **Spaced repetition**: `src/core/sm2.ts` implements SM-2 correctly —
  deterministic, explainable, well-evidenced for vocabulary acquisition. No
  change needed.
- **Data architecture**: `language_id` as a first-class FK
  (`src/db/schema.ts`) means a second language is a data insert, not a code
  change. `src/core/*` is pure, I/O-free, and fully unit-tested. This is
  already the "modern pattern" — resist the urge to restructure it further.
- **Theme system**: `src/theme/index.tsx`'s token-based `ThemeColors` with
  per-theme derived contrast tokens is correct and complete across 5 themes
  including a real dark mode (`night`). Keep as the single source of truth.
- **Learning mode variety**: recognition (audio-first flashcard review),
  picture+word browsing, production (on-device speech-matching pronunciation
  practice via `src/services/speech.ts` + `src/core/pronunciation.ts`,
  Expo-Go-safe fallback to record-and-replay), typing, swipeable revision,
  and karaoke-style story listening. This is already a genuinely multi-modal
  curriculum, not just flashcards.

## Findings

1. **Identity was written for a 7-year-old + parent-admin.** Copy like
   "Let's play and learn", league names (Sprout/Explorer/Star/Hero/Legend),
   and the "Parent Zone" framing assume a child user and a supervising
   adult. Broadening to a general beginner means the *content/settings*
   area shouldn't presuppose "a parent" manages it for you. The brand
   itself (KAL name, lion mark, splash, 5 themes) needs no change.

2. **Production practice sits outside the mastery loop.** `LearnScreen`'s
   Pronunciation tab (comment: "nothing recorded to the spaced-repetition
   schedule here") means a word can reach `isMastered()` in `sm2.ts` having
   only ever been recognized (audio → pick meaning / type English), never
   spoken. For a fluency goal, active recall/production should count toward
   mastery, not sit beside it.

3. **Typing practice only tested one recall direction.** `TypingScreen`
   showed the Setswana word and asked for the English meaning — recognition,
   not production. The harder, more valuable direction (see English, produce
   the Setswana word) didn't exist as an exercise.

4. **Two screens have grown large** (`ReviewScreen.tsx` ~890 lines,
   `AdminScreen.tsx` ~898 lines). Not a problem on its own — only worth
   splitting into sub-components the next time either file is meaningfully
   touched for unrelated reasons. No preemptive refactor.

5. **Navigation is a manual state machine in `App.tsx`.** Correct for 8
   screens; adding a router library would be unjustified overhead for an
   app this size. No change.

## Plan

| # | Item | Area | Status |
|---|---|---|---|
| 1 | Age-neutral copy pass: "Parent Zone" → "Settings" (header, tab label, biometric prompt, dashboard subtitles, empty-state copy in Story/Learn screens); home subtitle "Let's play and learn" → "Let's learn Setswana" | Identity | **Done** |
| 2 | Reverse-direction typing mode in `TypingScreen` (English → produce the Setswana word), reusing `gradeTypedAnswer` unchanged since it's already language-agnostic; audio for the target word is withheld until after checking in this direction so it can't leak the answer | Algorithm | **Done** |
| 3 | Feed pronunciation-practice attempts into `review_logs` / the SM-2 state so mastery requires at least one successful spoken attempt, not just recognition | Algorithm | Deferred — touches the DB write path and mastery model, needs its own design pass before coding |
| 4 | Split `ReviewScreen`/`AdminScreen` into sub-components | Structure | Deferred — do only when one of those files is next touched for another reason |

Verification for items 1–2: `npx tsc --noEmit` clean, `npx jest` 67/67
passing.

## Explicitly not recommended

- Rebranding (new name/logo/mascot) — the KAL identity is established and
  works for a general audience as-is.
- Adopting a navigation library (react-navigation etc.) — no problem it
  would solve at 8 screens.
- Any ML/adaptive personalization — SM-2 already satisfies "the app should
  remember what to review and when" deterministically and explainably,
  consistent with the original project brief (`PROMPT.md`).
