# A1 release & content-update checklist

How to ship content fixes and app versions once KAL e-Learning is on Google
Play. Content is **bundled in the app** (design decision, see
`2026-09-15-a1-curriculum-redesign.md` → "Considered and deferred: Supabase"),
so every content update is a normal app release on the internal testing track
first, then production.

## 1. Content update (any fix: wording, answer keys, new media)

1. Edit the Google Sheet (or `content/a1/*.csv` directly) — **never renumber
   or reuse an `id`**; installed learners' progress is keyed by it.
2. Drop new/changed recordings and photos into `content/media/audio/` and
   `content/media/images/`, named by ID (`a1-u01-w001.m4a`, `…-pl.m4a`,
   `a1-u01-d1-l03.m4a`). Any common audio format is fine.
3. Run from the repo root:
   ```
   npm run content      # validates CSVs, processes media, rebuilds the bundle
   npx jest             # 100 tests must stay green
   ```
   The content build **fails on errors**; warnings = missing media (fine
   before recording, must be zero for that unit before release).
4. Commit the CSVs **and** the regenerated `src/content/a1.json`,
   `src/content/media.ts`, `assets/content/*` together. Push.

## 2. Releasing an app version

1. Bump `expo.version` in `app.json` (versionCode auto-increments on EAS).
2. Build:
   ```
   npm run build:preview      # internal APK for phones/sideload testing
   npm run build:production   # signed AAB for Play
   ```
   First time: `npx eas login`, `npx eas init`, `npx eas build:configure` —
   and put the Play service-account key at `play-service-account-key.json`
   (gitignored) for `eas submit`.
3. Upload to the **internal testing track** (`eas submit -p android --latest`
   or Play Console web UI). Never straight to production.
4. Let the closed testing group (~10 beginners, per the design's quality
   gate) run it for a few days for anything beyond trivial fixes.
5. Promote to production in Play Console. Learners update via Play
   auto-update — no migration needed for content-only changes (progress DB
   is untouched; content IDs keep everything attached).

## 3. Quality gate (from the design, every release)

- [ ] Independent Botswana-standard speaker/teacher has proofread the units
      and answer keys changed in this release.
- [ ] `npm run content` reports 0 errors and 0 warnings for every released
      unit (no missing audio).
- [ ] Closed-track testers have exercised the changed units without new
      crashes or wrong-answer reports.
- [ ] Review banner in `content/a1/README.md` updated (AI-draft status).

## 4. First Play submission (one-time extras)

- Play Console: app created with package `com.nubianpixel.kalelearning`
  (set in `app.json` — do not change it after the first upload).
- Store listing assets: icon, feature graphic, screenshots (device frames),
  short + full description, privacy policy URL (offline, no data collected
  — mirror `app.json` permission strings: microphone only, recordings
  deleted immediately, never uploaded).
- Data safety form: no data collected/shared; audio recordings exist only
  in app cache and are deleted on rating.
- Content rating questionnaire; target audience (includes children —
  complete the Families policy checks).
- One-time $25 registration; upload the production AAB to internal testing.

## 5. When to revisit the "bundled" decision

- Google Sheets authoring proves too error-prone → switch authoring to
  Supabase tables pulled by `scripts/build-content.ts` (output unchanged).
- Learner retention after the beta justifies progress sync → new design
  decision required (accounts, privacy policy, Botswana DPA).
