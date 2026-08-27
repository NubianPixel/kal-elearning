/**
 * Domain types for KAL e-Learning.
 *
 * Multi-language by design: every content entity is keyed by `languageId`,
 * and the review engine never hardcodes a language. Adding a second
 * language later is a data operation only (insert a row in `languages`).
 */

export interface Language {
  id: number;
  /** ISO 639-1 style code, e.g. 'tn' for Setswana. */
  code: string;
  name: string;
}

export interface Category {
  id: number;
  languageId: number;
  name: string;
  /** Optional Ionicons name used as a visual cue for the child (minimal-text UI). */
  icon: string | null;
}

export type Difficulty = 1 | 2 | 3;

export interface VocabularyEntry {
  id: number;
  languageId: number;
  categoryId: number | null;
  /** The word/phrase in the target language (e.g. Setswana). */
  targetText: string;
  /** English meaning, shown to the English-speaking child. */
  translation: string;
  notes: string | null;
  difficulty: Difficulty;
  /** Local file URI of the admin-recorded pronunciation clip, if any. */
  audioUri: string | null;
}

/** SM-2 scheduling state for one vocabulary item, per device/profile. */
export interface CardState {
  vocabularyId: number;
  /** Ease factor; SM-2 default is 2.5, clamped to >= 1.3. */
  ease: number;
  /** Current inter-review interval in days (0 = new / due immediately). */
  intervalDays: number;
  /** Consecutive successful repetitions. */
  repetitions: number;
  /** Times the card was failed and reset. */
  lapses: number;
  /** ISO timestamp of the next due review. */
  dueDate: string;
  lastReviewedAt: string | null;
}

/** SM-2 answer quality (0-5). The child UI maps taps to these. */
export type AnswerQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewLog {
  id: number;
  vocabularyId: number;
  reviewedAt: string;
  quality: AnswerQuality;
  timeSpentMs: number | null;
}

export interface ProgressStats {
  /** Items with repetitions >= 3 and interval >= MASTERY_INTERVAL_DAYS. */
  mastered: number;
  /** Items seen at least once but not yet mastered. */
  learning: number;
  /** Items not yet introduced. */
  unseen: number;
  total: number;
  /** Consecutive-day review streak ending today (or yesterday). */
  streakDays: number;
  /** Correct answers / total answers over the last 30 days (0-1). */
  accuracy30d: number | null;
  /** Total review time in minutes. */
  minutesSpent: number;
  reviewsToday: number;
}
