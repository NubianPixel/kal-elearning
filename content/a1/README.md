# A1 content — family authoring guide

> **Unit 1–6 Setswana text was drafted by an AI that does not speak
> Setswana.** Unit 1 was reviewed by the project owner on 2026-09-15;
> Units 2–6 (drafted 2026-09-16) are awaiting that review. The tens 60–90
> (masome a matshela/masupa/marobedi/marobongwe) especially need a
> Botswana-standard check. Everything still needs the independent
> Botswana-standard review before release. Later units need the same checks
> as they're written.

**Editing sheet:** [KAL Setswana A1 Content](https://docs.google.com/spreadsheets/d/1NK8QH7qwELC_ZDjbQeBpn9fZjzvpQe6XSp3Ra91OCEc/edit)
— edit there, then export the tabs into this folder.

## How the sheet maps to these files

One Google Sheet, one tab per file:

| Sheet tab | File |
|---|---|
| `units` | `units.csv` |
| `items` | `items.csv` |
| `grammar` | `grammar.csv` |
| `dialogues` | `dialogues.csv` |
| `questions` | `questions.csv` |

Every row in every tab carries a `unit` number.

## Exporting from the sheet

For each tab: **File → Download → Comma Separated Values (.csv)**, then save
it into `content/a1/` **overwriting the file with the matching name**
(`units.csv`, `items.csv`, `grammar.csv`, `dialogues.csv`, `questions.csv`).
Don't rename the files and don't change the header row — the build script
checks it.

## ID rules

- Every `items`, `dialogues` and `questions` row has a stable `id`
  (e.g. `a1-u03-w012`, `a1-u01-d1-l03`, `a1-u01-q004`).
- **Never renumber or reuse an id**, even if a word is deleted or reordered.
  Ids are how a learner's progress stays attached to the right word after
  content changes. If a word is retired, just stop using it — don't recycle
  its id for something else.
- New items always get the next free number for their unit, in the format
  the build script expects:
  - items: `a1-uNN-wNNN`
  - dialogue lines: `a1-uNN-dN-lNN`
  - questions: `a1-uNN-qNNN`

## Audio

Save recordings into `content/media/audio/`, named after the id they belong
to:

| What | Filename |
|---|---|
| An item's main recording | `<item id>.m4a` (e.g. `a1-u01-w001.m4a`) |
| An item's plural, if it has one | `<item id>-pl.m4a` |
| A dialogue line | `<line id>.m4a` (e.g. `a1-u01-d1-l03.m4a`) |

Any common phone recording format is fine — the build step converts it to
`.m4a` automatically.

## Photos

Save into `content/media/images/`, named `<item id>.jpg` (or `.png`) and
referenced from that item's `image` column in `items.csv`.

- **Family's own photos only**, of concrete nouns (things you can point at
  and photograph — not abstract words).
- **No identifiable faces** — backs, hands, silhouettes and objects are
  fine, faces are not.
- Unit 1 has no images (it's all greetings) — this starts from Unit 2.

## Recording checklist

1. A quiet room — no TV, fan, or traffic noise in the background.
2. Hold the phone about 20 cm from your mouth.
3. Say the item **once**, clearly, at natural speaking speed — don't
   over-enunciate or slow down.
4. One take, one file per item (re-record the whole clip if you fumble it,
   don't try to splice).
5. Dialogue lines are recorded by different family members playing the
   different speakers, one line per file — never record a whole dialogue as
   one clip.

## Building

After editing the CSVs (and adding any new audio/images), run from the repo
root:

```
npm run content
```

This validates the CSVs, processes new/changed media, and rebuilds the
in-app content bundle. It fails loudly on errors (bad ids, missing
required fields, etc.) and warns about missing audio/images without
failing.
