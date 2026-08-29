import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { colors, childButton, bigText, titleText } from '../theme';
import {
  getReviewQueue,
  getMistakeWords,
  listVocabulary,
  recordAnswer,
  getDailyGoal,
  FREE_SESSION_LIMIT,
  type QueueItem,
} from '../db/repositories';
import { playClip } from '../audio';
import { buildChoices, pickChoiceMode, shuffle, type Choice, type ChoiceMode } from '../core/choices';
import WordImage from '../components/WordImage';
import type { VocabularyEntry } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  onExit: () => void;
  onOpenParentArea?: () => void;
  onFreeSessionEnd?: (correct: number, total: number) => void;
}

type Phase = 'loading' | 'card' | 'menu';
type MenuMode = 'empty' | 'done';
type PraiseIcon = 'star' | 'thumbs-up' | 'happy' | 'trophy' | 'heart' | 'sunny';

const PRAISE: readonly PraiseIcon[] = ['star', 'thumbs-up', 'happy', 'trophy', 'heart', 'sunny'];

/**
 * Rotating pastel card themes, from the blush palette so every card
 * stays on-brand while feeling fresh (soft pink / white / light rose).
 */
const CARD_THEMES = [
  { bg: '#F7D6D0' }, // soft pink
  { bg: '#FFFFFF' }, // white
  { bg: '#FBEAEC' }, // light rose (accentSoft)
  { bg: '#FFF5F5' }, // blush (background)
] as const;

/** Advance to the next card: compute its choice mode + options, play audio. */
function prepareCard(
  item: QueueItem,
  pool: VocabularyEntry[],
  setMode: (m: ChoiceMode) => void,
  setChoices: (c: Choice[]) => void,
): void {
  const mode = pickChoiceMode(item.entry, pool);
  setMode(mode);
  setChoices(buildChoices(item.entry, pool, mode));
}

/**
 * Child review session. Audio-first: the pronunciation clip plays
 * automatically when a card appears. The child taps one of four big
 * English meaning buttons — no reading of the target language required.
 */
export default function ReviewScreen({ db, languageId, onExit, onOpenParentArea, onFreeSessionEnd }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [mode, setMode] = useState<ChoiceMode>('text');
  const [picked, setPicked] = useState<number | null>(null);
  const [answered, setAnswered] = useState<'correct' | 'wrong' | null>(null);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  const [sessionTotal, setSessionTotal] = useState(0);
  const [allEntries, setAllEntries] = useState<VocabularyEntry[]>([]);
  const [freeMode, setFreeMode] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>('empty');
  const cardShownAt = useRef<number>(Date.now());
  const [praise] = useState<PraiseIcon>(() => PRAISE[Math.floor(Math.random() * PRAISE.length)]);
  const insets = useSafeAreaInsets();
  const safeEdges = {
    paddingTop: insets.top + 16,
    paddingBottom: insets.bottom + 24,
  };

  const load = useCallback(async () => {
    setPhase('loading');
    // The daily goal (settings) caps how many new words are introduced today.
    const goal = await getDailyGoal(db);
    const q = await getReviewQueue(db, languageId, new Date(), goal);
    const entries = q.map((item) => item.entry);
    setQueue(q);
    setAllEntries(entries);
    setSessionTotal(q.length);
    if (q.length === 0) {
      setMenuMode('empty');
      setPhase('menu');
    } else {
      prepareCard(q[0], entries, setMode, setChoices);
      setPhase('card');
      cardShownAt.current = Date.now();
      if (q[0].entry.audioUri) {
        playClip(q[0].entry.audioUri).catch(() => undefined);
      }
    }
  }, [db, languageId]);

  useEffect(() => {
    load().catch(() => {
      setMenuMode('empty');
      setPhase('menu');
    });
  }, [load]);

  /** Start a free practice round from ALL words (ignores schedule). */
  const startFree = useCallback(async () => {
    setPhase('loading');
    try {
      const all = await listVocabulary(db, languageId);
      const picked = shuffle(all).slice(0, FREE_SESSION_LIMIT);
      if (picked.length === 0) {
        setMenuMode('empty');
        setPhase('menu');
        return;
      }
      const items: QueueItem[] = picked.map((e) => ({
        entry: e,
        isNew: false,
        state: {
          vocabularyId: e.id,
          ease: 2.5,
          intervalDays: 0,
          repetitions: 0,
          lapses: 0,
          dueDate: new Date(0).toISOString(),
          lastReviewedAt: null,
        },
      }));
      setFreeMode(true);
      setAllEntries(picked);
      setStats({ total: 0, correct: 0 });
      setQueue(items);
      setSessionTotal(items.length);
      prepareCard(items[0], picked, setMode, setChoices);
      setPhase('card');
      cardShownAt.current = Date.now();
      if (items[0].entry.audioUri) {
        playClip(items[0].entry.audioUri).catch(() => undefined);
      }
        } catch {
      setMenuMode('empty');
      setPhase('menu');
    }
  }, [db, languageId]);

  /** Start a free practice round from previously-wrong answers only. */
  const startMistakes = useCallback(async () => {
    setPhase('loading');
    try {
      const wrong = await getMistakeWords(db, languageId);
      if (wrong.length === 0) {
        setMenuMode('empty');
        setPhase('menu');
        return;
      }
      const items: QueueItem[] = wrong.map((e) => ({
        entry: e,
        isNew: false,
        state: {
          vocabularyId: e.id,
          ease: 2.5,
          intervalDays: 0,
          repetitions: 0,
          lapses: 0,
          dueDate: new Date(0).toISOString(),
          lastReviewedAt: null,
        },
      }));
      setFreeMode(true);
      setAllEntries(wrong);
      setStats({ total: 0, correct: 0 });
      setQueue(items);
      setSessionTotal(items.length);
      prepareCard(items[0], wrong, setMode, setChoices);
      setPhase('card');
      cardShownAt.current = Date.now();
      if (items[0].entry.audioUri) {
        playClip(items[0].entry.audioUri).catch(() => undefined);
      }
    } catch {
      setMenuMode('empty');
      setPhase('menu');
    }
  }, [db, languageId]);

  const current = queue[0];

  function choose(choiceIndex: number) {
    if (answered || !current) return;
    setPicked(choiceIndex);
    const correct = choices[choiceIndex].isCorrect;
    setAnswered(correct ? 'correct' : 'wrong');
    setStats((s) => ({ total: s.total + 1, correct: s.correct + (correct ? 1 : 0) }));
  }

  async function next() {
    if (!current) return;
    const timeSpentMs = Date.now() - cardShownAt.current;
    const answer = answered === 'correct' ? 'good' : 'again';
    // Free practice must NOT change the spaced-repetition schedule.
    if (!freeMode) {
      try {
        await recordAnswer(db, current.entry.id, answer, timeSpentMs);
      } catch {
        // The review flow must never be blocked by a persistence hiccup.
      }
    }

    const rest = queue.slice(1);
    const nextQueue = answered === 'wrong' ? [...rest, current] : rest; // failed cards re-queue in-session
    setQueue(nextQueue);
    setAnswered(null);
    setPicked(null);

    if (nextQueue.length === 0) {
      setMenuMode('done');
      onFreeSessionEnd?.(stats.correct, stats.total);
      setPhase('menu');
    } else {
      prepareCard(nextQueue[0], allEntries, setMode, setChoices);
      cardShownAt.current = Date.now();
      if (nextQueue[0].entry.audioUri) {
        playClip(nextQueue[0].entry.audioUri).catch(() => undefined);
      }
    }
  }

  if (phase === 'loading') {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (phase === 'menu') {
    return (
      <View style={[styles.center, safeEdges]}>
        {menuMode === 'done' ? (
          <>
            <Ionicons name="ribbon" size={80} color={colors.accent} />
            <Text style={titleText}>Great job!</Text>
            <Text style={styles.doneStats}>
              {stats.correct} of {stats.total} correct!
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={72} color={colors.primary} />
            <Text style={titleText}>All done for now!</Text>
          </>
        )}

        <View style={styles.menuButtons}>
          {!freeMode && (
            <Pressable
              style={[childButton, styles.menuButton]}
              onPress={startFree}
              accessibilityLabel="Flashcards — practice all words"
            >
              <Ionicons name="reader-outline" size={24} color={colors.dark} />
              <Text style={styles.menuButtonText}>Flashcards</Text>
            </Pressable>
          )}
          {!freeMode && (
            <Pressable
              style={[childButton, styles.menuButton]}
              onPress={load}
              accessibilityLabel="Daily practice — due words"
            >
              <Ionicons name="calendar-number-outline" size={24} color={colors.dark} />
              <Text style={styles.menuButtonText}>Daily practice</Text>
            </Pressable>
          )}
          <Pressable
            style={[childButton, styles.menuButton]}
            onPress={startMistakes}
            accessibilityLabel="Practice mistakes — recently wrong words"
          >
            <Ionicons name="bicycle-outline" size={24} color={colors.dark} />
            <Text style={styles.menuButtonText}>Mistakes</Text>
          </Pressable>
        </View>

        <View style={styles.menuButtons}>
          {onOpenParentArea && (
            <Pressable
              style={[childButton, styles.nextButton]}
              onPress={onOpenParentArea}
              accessibilityLabel="Parent dashboard"
            >
              <Ionicons name="person-outline" size={26} color={colors.dark} />
              <Text style={styles.nextText}>Parent</Text>
            </Pressable>
          )}
          <Pressable
            style={[childButton, styles.nextButton]}
            onPress={onExit}
            accessibilityLabel="Home"
          >
            <Ionicons name="home" size={26} color={colors.dark} />
            <Text style={styles.nextText}>Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const cardTheme = CARD_THEMES[stats.total % CARD_THEMES.length];
  const cardNumber = String(stats.total + 1).padStart(2, '0');
  const dashCount = Math.min(Math.max(sessionTotal, 1), 10);
  const filledDashes = Math.round((stats.total / Math.max(sessionTotal, 1)) * dashCount);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, safeEdges]}
      scrollIndicatorInsets={{ top: safeEdges.paddingTop, bottom: safeEdges.paddingBottom, left: 0, right: 0 }}
    >
      <View style={styles.topRow}>
        <View style={styles.progressRow}>
          {Array.from({ length: dashCount }).map((_, i) => (
            <View key={i} style={[styles.progressDash, i < filledDashes && styles.progressDashOn]} />
          ))}
        </View>
        <Text style={styles.progressText}>
          {stats.total}/{sessionTotal}
        </Text>
        <Pressable onPress={onExit} style={styles.closeButton} accessibilityLabel="Exit review">
          <Ionicons name="close" size={24} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.stackArea}>
        <View style={[styles.stackCard, styles.stackCardFar, { backgroundColor: colors.card }]} />
        <View style={[styles.stackCard, styles.stackCardNear, { backgroundColor: cardTheme.bg }]} />
        <Pressable
          style={[styles.audioCard, { backgroundColor: cardTheme.bg }]}
          onPress={() =>
            current?.entry.audioUri && playClip(current.entry.audioUri).catch(() => undefined)
          }
        >
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{cardNumber}</Text>
          </View>

          {mode === 'text' && current?.entry.imageUri ? (
            <View style={styles.imageCircle}>
              <WordImage uri={current.entry.imageUri} style={styles.circleImage} iconSize={80} />
            </View>
          ) : (
            <View style={styles.imageCircle}>
              <Ionicons name="volume-high" size={64} color={colors.primary} />
            </View>
          )}

          <Text style={styles.targetWord}>{current?.entry.targetText}</Text>
          <View style={styles.hintPill}>
            <Ionicons name="ear" size={16} color={colors.primary} />
            <Text style={styles.hintText}>
              {mode === 'image' ? 'Which picture is it?' : 'Tap the card to hear it!'}
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.choicesGrid}>
        {choices.map((choice, i) => {
          const wrapStyle =
            answered === null
              ? styles.choiceIdle
              : choice.isCorrect
                ? styles.choiceCorrect
                : i === picked
                  ? styles.choiceWrong
                  : styles.choiceDim;
          if (mode === 'image') {
            return (
              <Pressable
                key={choice.entry.id}
                style={[styles.choiceImageWrap, wrapStyle]}
                onPress={() => choose(i)}
              >
                <View style={styles.choiceImageClip}>
                  <WordImage uri={choice.entry.imageUri} style={styles.choiceImage} />
                </View>
                {answered !== null && choice.isCorrect && (
                  <View style={styles.choiceBadge}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </View>
                )}
                {answered !== null && i === picked && !choice.isCorrect && (
                  <View style={[styles.choiceBadge, styles.choiceBadgeWrong]}>
                    <Ionicons name="close" size={18} color="#fff" />
                  </View>
                )}
              </Pressable>
            );
          }
          return (
            <Pressable
              key={choice.entry.id}
              style={[styles.choiceButton, wrapStyle]}
              onPress={() => choose(i)}
            >
              <Text style={styles.choiceText}>{choice.entry.translation}</Text>
              {answered !== null && choice.isCorrect && (
                <View style={styles.choiceBadge}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
              )}
              {answered !== null && i === picked && !choice.isCorrect && (
                <View style={[styles.choiceBadge, styles.choiceBadgeWrong]}>
                  <Ionicons name="close" size={18} color="#fff" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {answered !== null && (
        <Pressable style={[childButton, styles.nextButton]} onPress={next}>
          {answered === 'correct' && (
            <Ionicons name={praise} size={26} color={colors.dark} />
          )}
          <Text style={styles.nextText}>
            {answered === 'correct' ? 'Yes! Next' : 'Almost! Try the next one'}
          </Text>
          <Ionicons name="arrow-forward" size={26} color={colors.dark} />
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  progressDash: {
    flex: 1,
    maxWidth: 26,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EFD8DA',
  },
  progressDashOn: { backgroundColor: colors.primary },
  progressText: { fontSize: 13, fontWeight: '800', color: colors.muted },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.dark,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stackArea: { marginBottom: 28 },
  stackCard: {
    position: 'absolute',
    borderRadius: 32,
    shadowColor: colors.dark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  stackCardNear: { top: 12, left: 14, right: 14, bottom: -12 },
  stackCardFar: { top: 24, left: 28, right: 28, bottom: -24 },
  audioCard: {
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: colors.dark,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  numberBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dark,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  numberText: { fontSize: 16, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  imageCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  circleImage: { width: 164, height: 164, borderRadius: 82, backgroundColor: 'transparent' },
  targetWord: { ...titleText, fontSize: 40, textAlign: 'center', marginTop: 4 },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hintText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  choicesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  choiceIdle: {
    borderColor: colors.primarySoft,
    backgroundColor: colors.card,
  },
  choiceCorrect: {
    borderColor: colors.correct,
    backgroundColor: colors.primarySoft,
  },
  choiceWrong: {
    borderColor: colors.wrong,
    backgroundColor: '#FBE9E5',
  },
  choiceDim: {
    borderColor: colors.primarySoft,
    backgroundColor: colors.card,
    opacity: 0.45,
  },
  choiceButton: {
    width: '48.5%',
    minHeight: 96,
    borderRadius: 24,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    marginBottom: 14,
    shadowColor: colors.dark,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  choiceImageWrap: {
    width: '48.5%',
    height: 130,
    borderRadius: 24,
    borderWidth: 3,
    marginBottom: 14,
    shadowColor: colors.dark,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  choiceImageClip: {
    width: '100%',
    height: '100%',
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  choiceImage: { width: '100%', height: '100%' },
  choiceBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.correct,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  choiceBadgeWrong: { backgroundColor: colors.wrong },
  choiceText: { ...bigText, textAlign: 'center' },
  nextButton: {
    backgroundColor: colors.primary,
    paddingVertical: 24,
    flexDirection: 'row',
    gap: 10,
  },
  nextText: { fontSize: 24, fontWeight: '800', color: colors.dark },
  doneStats: { ...bigText, marginVertical: 16 },
  menuButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  menuButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flex: 1,
    minWidth: 120,
  },
  menuButtonText: { fontSize: 15, fontWeight: '800', color: colors.dark },
});

