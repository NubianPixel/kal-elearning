# KAL e-Learning — A1 Curriculum Redesign

Date: 2026-09-15
Status: Agreed (design interview), not started
Supersedes: the child/parent-admin framing in `README.md` and `PROMPT.md`,
and items 3–4 of `2026-09-04-general-learner-audit-plan.md`.

## Why

The 2026-09-15 audit found the app is a polished flashcard app, not a
curriculum:

- 12 seed words, 1 story; all further content parent-authored with no
  syllabus.
- No units, levels, sequencing or grammar (noun classes, concords, plurals).
- Only recognition (Setswana → English) feeds SM-2 "mastery"; guessable
  multiple choice.
- Leagues/XP are farmable and read as proficiency ("Language master").
- No measure of comprehension or fluency.
- Pronunciation: speech recognition likely unsupported for Setswana and
  sends audio to the cloud; the MFCC/DTW engine is not wired to any screen
  and cannot detect tone or accent.

## Goals

- Take **any beginner (all ages)** to **CEFR A2**, shipping **A1 first**.
- Every level and "mastered" claim is backed by an automatically graded
  measure.
- Stay offline, account-free and (near) zero budget.

## Non-goals (A1)

- Automatic pronunciation, accent or tone scoring.
- Placement test.
- Sync backend, accounts, analytics.
- iOS release.
- Preserving existing on-device progress.

## Decisions

### Audience & content

| Topic | Decision |
|---|---|
| Learner | Any beginner, all ages |
| Endpoint | CEFR A2; A1 (~500 words, ~10 units) released first |
| Author | Project owner's family writes and records all content |
| Standard | Botswana orthography and usage |
| ê / ô | Stored and shown in content; typing accepts answers with or without them |
| Delivery | Bundled in the app: authored as files in the repo (text + audio), packed at build time |
| IDs | Stable, hand-assigned per item (e.g. `a1-u03-w012`) so content fixes never scramble progress |
| In-app authoring | Removed; curriculum is read-only in the app |

### Curriculum structure

| Topic | Decision |
|---|---|
| Unit basis | One can-do goal + one grammar point (e.g. "Introduce your family" + noun class 1/2 mo-/ba-) |
| Unit shape | Fixed 4 steps: **Words** (hear, picture, meaning) → **Grammar** (short note, examples, drills) → **Use it** (dialogue/story, comprehension questions, record-and-compare) → **Checkpoint** |
| Unlocking | Next unit unlocks on passing the current checkpoint |
| Skipping | Any locked unit's checkpoint may be attempted directly ("test out"); no placement test |
| Checkpoint skills | Listening (audio only, no written word), recall (English → type Setswana), grammar (forms, prefixes, concords), reading comprehension |
| Pass rule | ≥80% overall **and** ≥60% in each skill |
| Question pool | Drawn randomly from a pool ~2× the test size |
| Retry | Allowed immediately after reviewing missed items; no lockout |

### Learning engine

| Topic | Decision |
|---|---|
| Role of SRS | Retention across units; unlocks come from checkpoints only |
| Cards per word | Two independent SM-2 states: **listen** (hear → meaning) and **recall** (English → Setswana) |
| Other cards | Each grammar point contributes a pool of drill cards |
| Mastered | Word mastered only when both its cards meet the existing rule (≥3 consecutive correct, interval ≥21 days, `src/core/sm2.ts`) |
| Grading | Wrong = 2, correct = 4, correct but slow (>~8 s) = 3; no self-grading |
| Guess guards | Listening uses 4–6 options with confusable distractors (same unit / noun class / similar sound), never drawn only from today's due list |
| Speaking | Record-and-compare, self-rated ("nailed it / close / again"); rating stored without audio, shown in Progress, "again" items resurface in Use-it; **never** affects mastery, SRS or unlocks |

### Motivation

| Topic | Decision |
|---|---|
| Removed | XP, leagues, XP rewards, "Language master" badge |
| Progress shown | CEFR band + unit ("A1 · Unit 4 of 10"), words mastered, checkpoint badges |
| Daily goal | Clear today's due cards **and** introduce N new items (N = 5 / 10 / 15), counted per calendar day |
| Backlog | Daily review cap (~60 cards, most-overdue first); goal counts as met at the cap; new items pause while backlog exceeds the cap |
| Streak | Consecutive days the daily goal was met |
| Free practice | Mistakes, flashcards and typing never count toward goal, streak or SRS |

### Flow & UX

| Topic | Decision |
|---|---|
| Home | One **Continue** button (due reviews first, then next unit step) + unit path map (locked / unlocked / passed) |
| Tabs | **Home** · **Practice** (Mistakes, Flashcards, Typing) · **Library** (Words, Stories) · **Progress** (stats + settings) |
| Word browser | Learn › Revision grid and RevisionDeck merged into one searchable list of unlocked words with audio |
| Stories | Library replays any unlocked unit's story/dialogue with karaoke highlight |
| Removed | Floating play FAB, Parent/Settings gate, separate Learn/Review menus |
| Style | One neutral-warm style: keep KAL brand and lion; single KAL palette (cream / deep green / amber, `src/theme/index.tsx`) replaces the five selectable themes; Setswana praise stays; tap-to-continue replaces auto-advance |

### Privacy & data

| Topic | Decision |
|---|---|
| Network | None (cloud speech recognition removed) |
| Backup | Progress screen exports/imports a JSON file of progress; never includes audio |
| Voice | Temp file in app cache for playback only; deleted on rating, leaving the item, app background, and app start; never in DB or export |
| Migration | None; old database wiped on upgrade |

### Release

| Topic | Decision |
|---|---|
| Channel | Google Play only (one-time $25); iOS reconsidered after traction |
| Quality gate | Independent Botswana-standard speaker/teacher proofreads all units and answer keys, **plus** closed Play testing track with ~10 real beginners for a few weeks |

## Code impact

**Delete**

- `src/core/dsp/*`, `src/services/pronunciationEngine.ts`,
  `pronunciation_attempts` table and its repository functions
- `src/services/speech.ts`, `src/core/pronunciation.ts` speech matching
  (keep `normalizeForMatch`/`similarity` if typing still needs them)
- `src/core/gamification.ts` (XP, leagues, rewards) and all XP UI
- `src/screens/AdminScreen.tsx`, `src/screens/StoryManagerScreen.tsx`,
  biometric lock (`expo-local-authentication`), image picker if unused
- Current `HomeScreen`, `ReviewScreen` menu, `LearnScreen`, `RevisionDeck`
  as separate screens (logic reused where it fits)

**Keep**

- `src/core/sm2.ts` (run per card)
- `src/core/typing.ts` grader (update for ê/ô tolerance and to stop
  accepting answers that merely contain the target)
- `src/core/progress.ts` streak logic (redefined on goal-met days)
- Theme system, `audio.ts` playback, SQLite storage, `TabBar`/`AppHeader`
  (reshaped to 4 tabs)

**New**

- Content format + build step that packs repo content into the app
- Schema: units, lessons/steps, items with stable IDs (word, grammar drill),
  word metadata (part of speech, noun class, plural), stories/dialogues,
  checkpoint question pools, card states keyed by (item ID, card type),
  checkpoint results, speaking self-ratings
- Unit path + Continue router, checkpoint runner, record-and-compare step,
  Progress tab, export/import

## Build order

1. **Freeze the content format** — units, words, grammar notes, drills,
   stories, checkpoint pools, stable IDs, audio file naming and recording
   guidelines. Blocks all authoring.
2. **Vertical slice** — author Unit 1 fully and build its end-to-end flow
   (Words → Grammar → Use it → Checkpoint, SRS cards, Continue). Self-test.
3. **Parallel** — author units 2–10 while building path map, full SRS
   (cap/backlog), Practice, Library, Progress, export/import.
4. **External language review → closed Play beta → public release.**

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Authoring effort ~150+ h (~500 words, ~200 sentences, ~10 texts, ~400 checkpoint questions) on one family | Critical path; release slips | Freeze format early; vertical slice validates effort per unit before committing to 10 |
| Single voice/dialect in all audio | Weaker listening skills | Recruit extra voices for later units if possible |
| No automatic pronunciation, accent or tone feedback | Speaking skill unmeasured; part of the original ask not met | Explicit post-A1 item; would need a Setswana acoustic model (open data such as NCHLT is South African, mismatching the Botswana standard) |
| Content errors in answer keys | Correct Setswana marked wrong; trust loss | External reviewer + beta gate |
| Checkpoint thresholds (80/60) and slow-answer cutoff (~8 s) are guesses | Too hard/easy gating | Tune from beta results |
| Android only | iOS learners excluded | Revisit after traction |

## A1 unit list

Agreed 2026-09-15. Setswana examples were drafted by a non-speaker and
accepted by the project owner; spelling is verified when content files are
written and again by the external reviewer.

### Cross-unit rules

| Rule | Decision |
|---|---|
| Grammar per unit | Exactly **one** grammar point is taught, drilled and tested. Other constructions may appear only as fixed patterns without explanation |
| Unit size | Ramp from ~25 items (U1–2) to ~60 (U9–10); ~450–500 items total |
| Phrases | Set phrases are items like words: listen + recall cards, count toward the item total and "mastered" |
| Listen-only exposure | Structures deferred to A2 may appear in dialogues/stories but are never produced or tested |
| Recording | Any composed form used in listening questions (e.g. numbers like 37) is recorded as its own clip; clips are never concatenated |
| A1 completion | Separate **A1 exit test** after Unit 10, drawn from all ten units' checkpoint pools, same 80% overall / 60% per skill rule; passing awards the A1 badge |

### Units

| # | Title | Can-do goal | Grammar point (tested) | Items | Use it |
|---|---|---|---|---|---|
| 1 | Dumela | Greet politely, say how you are, say goodbye | Singular vs plural address: *Dumela/Dumelang*, *o/le*, *rra/borra*; farewell depends on who leaves (*Tsamaya/Sala sentle*) | ~25 | Two neighbours meet in the morning and part |
| 2 | Ke nna… | Say your name, where you're from, what you speak | Subject concords *ke/o/o/re/lo/ba* with *tswa, nna, bua* + emphatic pronouns *nna…bone* | ~25 | Meeting a stranger at a bus stop |
| 3 | Lelapa | Introduce your family | Class 1/2 *mo-/ba-*, 1a/2a *bo-* plural, possessive *wa/ba + me/gago/gagwe* (on non-kin nouns) | ~36 | Showing a family photo |
| 4 | Ke batla… | Say what you want/like and don't | Negation *ga ke …* with final *-a → -e* | ~35 | Ordering food |
| 5 | Ke bokae? | Count, give your age, ask prices | Quantity pattern noun + *di le* + number (class 10 *dipula*, *dingwaga*) | ~40 | Buying at a market stall |
| 6 | Ke eng? | Name things at home, ask what something is | Noun class plurals *se-/di-* and *le-/ma-* (singular ↔ plural, with recycled *mo-/ba-*) | ~45 | Tour of a home |
| 7 | O ya kae? | Ask for and give simple directions | Locative suffix *-ng* after *kwa/mo* (*-a → -eng*; exceptions *kwa gae*, place names) | ~50 | Finding the way in town |
| 8 | Letsatsi la me | Describe your day and week | *ka* + time expressions (days, parts of day, whole hours) | ~55 | A weekday routine |
| 9 | Go a tsididi | Talk about weather, feelings, simple aches | Impersonal *go* (*go a fisa*, *go na le …*) | ~55 | A sick day / weather chat |
| 10 | Maabane le ka moso | Say what you did and will do | Past perfect (*-ile* + common irregulars: *jele, nwele, ile, tlile, robetse, tsamaile, lwetse*) | ~60 | A weekend told in past, then future plans |

### Per-unit notes

- **U1:** Items — Dumela, Dumelang, rra, mma, borra, bomma; O/Le tsogile
  jang?, Ke/Re tsogile sentle; O/Le kae?, Ke/Re teng; O tlhotse jang?,
  Ke tlhotse sentle; Ke a leboga, Tswee-tswee, Intshwarele, Go siame; Ee,
  Nnyaa; Tsamaya sentle, Sala sentle, Robala sentle. Culture note: greeting
  with *rra/mma* is expected; skipping it is rude.
- **U2:** Pronouns nna, wena, ene, rona, lona, bone. *Leina la me ke…* is a
  fixed phrase. Survival phrases *Ga ke tlhaloganye*, *Bua ka bonya,
  tswee-tswee*, *Ke eng ka Setswana?* are fixed items (negation explained in
  U4).
- **U3:** Kinship uses **fused possessive forms** as items (*mme, rre,
  mmago, rrago, mmaagwe, rraagwe*); the *wa/ba* rule is drilled on non-kin
  nouns (*ngwana wa me, bana ba me*). *ngwana/bana* is an irregular item.
  *Yo ke…* is a fixed phrase (demonstratives are A2).
- **U4:** Patterns only (not tested): *Ke a ja* vs *Ke ja nama*, yes/no
  *A o …?*, *go* + verb (*Ke batla go ja*).
- **U5:** SRS items are 1–10, 11 and tens to 100 (*lekgolo*). Other
  numbers appear only in questions and need their own recordings (compound
  units change form, e.g. *le bosupa*). Recall accepts digits or words for
  11–100.
- **U6:** Irregulars (*ntlo/matlo*, *lee/mae*) are items, not drill
  targets. Answers to *Ke eng?* use *Ke …*, avoiding demonstratives.
- **U7:** "Where is X?" is **not** produced: learners use *Ke batla…* and
  *A go gaufi/kgakala?*. Concord forms (*Lebenkele le kae?*) are
  listen-only in dialogues.
- **U8:** Clock time is whole hours only (*ka ura ya …*); *motsotso/metsotso*
  is vocabulary only. Class 3/4 plural rule moved to A2.
- **U9:** Class 9/10 nouns (*ntša/dintša, nku/dinku, pula/dipula, tsebe/
  ditsebe*) are plain items; the *n-/din-* plural rule moved to A2.
- **U10:** Future *Ke tla + verb* is a pattern, used freely but not tested.
  Past negation *Ga ke a …* is a pattern (2–3 fixed items, A2 explains it).
  Callback: U1's *Ke tsogile sentle* is the past of *tsoga*.

### Deferred to A2

Adjectives and number agreement with nouns; demonstratives; relative
clauses; class 3/4 and 9/10 plural rules; classes 11/14/15 in depth;
subject concords for non-human classes (*X le/se/bo kae?*); past negation;
clock minutes.

## Content format

Agreed 2026-09-15.

### Authoring pipeline

| Topic | Decision |
|---|---|
| Tool | One Google Sheet, **one tab per content type**: `units`, `items`, `grammar`, `dialogues`, `questions` (every row carries `unit`) |
| Into repo | Manual *File → Download → CSV* per tab into `content/a1/` (no API, no credentials) |
| Build | Script validates CSVs + media, processes media, emits bundled content for the app; fails loudly on errors |
| Generated questions | Listening and recall checkpoint questions are generated at runtime from unit items (random, confusable distractors) |
| Authored questions | Grammar and reading only, ~15–20 per unit |

### Tabs

**units** — `unit` · `title_setswana` · `title_english` · `can_do` · `grammar_title`

**items**

| Column | Example | Notes |
|---|---|---|
| `id` | `a1-u03-w012` | Stable; never reused or renumbered |
| `unit` | `3` | |
| `order` | `12` | Introduction order in the Words step |
| `kind` | `word` / `phrase` | |
| `setswana` | `mosadi` | Displayed form, ê/ô where used |
| `setswana_alt` | | Other accepted spellings, `\|`-separated |
| `english` | `woman \| wife` | Accepted answers; first is displayed |
| `hint` | `to one person` | Disambiguates recall prompts |
| `pos` | `noun` | noun · verb · pronoun · number · adverb · phrase · other |
| `noun_class` | `1` | Blank if not a noun |
| `plural` | `basadi` | Field only — plurals are **not** separate SRS items |
| `image` | `a1-u03-w012.jpg` | Optional; concrete nouns only |
| `note` | | Optional usage note shown after answering |

**grammar** (the unit's note) — `unit` · `order` · `type` (`text` / `example`) · `text_or_setswana` · `english`

**dialogues** — `id` (`a1-u01-d1-l03`) · `unit` · `order` · `speaker` · `setswana` · `english`

**questions** — `id` · `unit` · `skill` (`grammar` / `reading`) · `use` (`drill` / `checkpoint`) · `format` (`choice` / `type`) · `prompt` · `answer` · `answer_alt` · `distractors` (`|`-separated) · `explanation`. Reading questions refer to the unit's dialogue. Checkpoint questions never appear in review; ~10 drill + ~10 checkpoint grammar questions per unit.

### Media

| Topic | Decision |
|---|---|
| Audio names | `<item id>.m4a`, plural `<item id>-pl.m4a`, dialogue line `<line id>.m4a`; any common input format accepted |
| Audio processing | Build step (ffmpeg): trim silence, loudness-normalise, mono AAC |
| Speed | One natural-speed clip per item; app offers 0.75× pitch-preserving playback |
| Voices | Items any one voice; dialogue speakers recorded by different family members |
| Images | Family's **own photos**, concrete nouns only; build step resizes to ~512 px WebP |
| People in photos | **No identifiable faces** (backs, hands, silhouettes) — reviewer checklist item, not machine-checked |

## Open

- Recording checklist for the family (quiet room, distance from phone,
  one take per file) — write alongside Unit 1 authoring.
