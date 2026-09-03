import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { makeTextStyles, useTheme, childButton, type ThemeColors } from '../theme';
import {
  getReviewQueue,
  getMistakeWords,
  listVocabulary,
  recordAnswer,
  getDailyGoal,
  getDifficulty,
  getXp,
  addXp,
  getProgressStats,
  choiceCountForDifficulty,
  type QueueItem,
} from '../db/repositories';
import { playClip, playEffect, stopActiveClip, ensurePlaybackMode, useClipToggle } from '../audio';
import ProgressBar from '../components/ProgressBar';
import {
  buildChoices,
  pickChoiceMode,
  shuffle,
  type Choice,
  type ChoiceMode,
} from '../core/choices';
import { leagueForXp, leagueProgress, nextReward, xpForAnswer } from '../core/gamification';
import WordImage from '../components/WordImage';
import CircleFrame from '../components/CircleFrame';
import { TAB_BAR_SPACE } from '../components/TabBar';
import type { VocabularyEntry } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  onExit: () => void;
  onRevise: () => void;
}

type Phase = 'loading' | 'card' | 'menu';
type MenuMode = 'ready' | 'caughtup' | 'done';
type PraiseIcon = 'star' | 'thumbs-up' | 'happy' | 'trophy' | 'heart' | 'sunny';

/** Shape of the hero start button on the review menu. */
interface LeaderAttrs {
  label: string;
  onPress: () => void;
  sub: string;
}

const PRAISE: readonly PraiseIcon[] = ['star', 'thumbs-up', 'happy', 'trophy', 'heart', 'sunny'];

/** Auto-advance delay after a correct tap: quick enough to feel magic. */
const ADVANCE_MS_CORRECT = 900;
/** After a wrong tap, linger a little so the right answer can be seen. */
const ADVANCE_MS_WRONG = 1600;

/** Advance to the next card: compute its choice mode + options. */
function prepareCard(
  item: QueueItem,
  pool: VocabularyEntry[],
  count: number,
  setMode: (m: ChoiceMode) => void,
  setChoices: (c: Choice[]) => void,
): void {
  const mode = pickChoiceMode(item.entry, pool, count);
  setMode(mode);
  setChoices(buildChoices(item.entry, pool, mode, count));
}

/**
 * Wrap plain vocabulary entries as queue items with a neutral SM-2 state.
 * Used by the free-practice modes (flashcards, mistakes), which never
 * advance the review schedule and so don't need each word's real state.
 */
function toQueueItems(entries: VocabularyEntry[]): QueueItem[] {
  return entries.map((e) => ({
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
}

/**
 * Child review session — the gamified “Practice” hub opened from the
 * big center play button (or Home). Only ONE clip plays at a time; the
 * audio card toggles play/pause and flips its icon, and correct / wrong
 * answers play friendly chimes. Daily decks are the same set every day
 * but their order is shuffled, and flashcards always use the full word
 * list so the child sees the same questions time after time.
 */
export default function ReviewScreen({ db, languageId, onExit, onRevise }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [menuMode, setMenuMode] = useState<MenuMode>('ready');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [mode, setMode] = useState<ChoiceMode>('text');
  const [picked, setPicked] = useState<number | null>(null);
  const [answered, setAnswered] = useState<'correct' | 'wrong' | null>(null);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  const [sessionTotal, setSessionTotal] = useState(0);
  const [allEntries, setAllEntries] = useState<VocabularyEntry[]>([]);
  const [freeMode, setFreeMode] = useState(false);
  const [hasDue, setHasDue] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [choiceCount, setChoiceCount] = useState(4);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [praise] = useState<PraiseIcon>(() => PRAISE[Math.floor(Math.random() * PRAISE.length)]);

  const cardShownAt = useRef<number>(Date.now());
  const stateRef = useRef({ queue, answered, freeMode, stats, allEntries, sessionTotal });
  useEffect(() => {
    stateRef.current = { queue, answered, freeMode, stats, allEntries, sessionTotal };
  }, [queue, answered, freeMode, stats, allEntries, sessionTotal]);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancingRef = useRef(false);
  /** Words answered wrong at least once this session (all modes) — gates retry XP. */
  const missedSet = useRef<Set<number>>(new Set());
  /** Non-free words already recorded as ‘again’ (scheduling). */
  const recordedWrong = useRef<Set<number>>(new Set());

  const insets = useSafeAreaInsets();
  const safeEdges = {
    paddingTop: 8,
    paddingBottom: insets.bottom + TAB_BAR_SPACE,
  };

  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);

  useEffect(() => {
    ensurePlaybackMode();
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      stopActiveClip();
    };
  }, []);

  const league = leagueForXp(xp);
  const leagueInfo = leagueProgress(xp);
  const reward = nextReward(xp);

  /** Gather menu data (due count, difficulty, XP, streak) and show the start screen. */
  const bootstrap = useCallback(async () => {
    setPhase('loading');
    try {
      const [goal, difficulty] = await Promise.all([getDailyGoal(db), getDifficulty(db)]);
      setChoiceCount(choiceCountForDifficulty(difficulty));
      const [q, xpTotal, statsP] = await Promise.all([
        getReviewQueue(db, languageId, new Date(), goal),
        getXp(db),
        getProgressStats(db, languageId),
      ]);
      setHasDue(q.length > 0);
      setDueCount(q.length);
      setXp(xpTotal);
      setStreak(statsP.streakDays);
      setMenuMode('ready');
      setPhase('menu');
    } catch {
      setMenuMode('ready');
      setPhase('menu');
    }
  }, [db, languageId]);

  useEffect(() => {
    bootstrap().catch(() => undefined);
  }, [bootstrap]);

  /** Common tail of every session start: seed state and show the first card. */
  const beginSession = useCallback(
    (items: QueueItem[], entries: VocabularyEntry[], count: number, isFree: boolean) => {
      setFreeMode(isFree);
      setAllEntries(entries);
      setStats({ total: 0, correct: 0 });
      setXpGained(0);
      missedSet.current = new Set();
      recordedWrong.current = new Set();
      setQueue(items);
      setSessionTotal(items.length);
      setMenuMode('ready');
      prepareCard(items[0], entries, count, setMode, setChoices);
      setPhase('card');
      cardShownAt.current = Date.now();
      if (items[0].entry.audioUri) playClip(items[0].entry.audioUri).catch(() => undefined);
    },
    [],
  );

  /** Start the daily practice session (the scheduled due deck, shuffled). */
  const startDaily = useCallback(async () => {
    setPhase('loading');
    try {
      const difficulty = await getDifficulty(db);
      const count = choiceCountForDifficulty(difficulty);
      setChoiceCount(count);
      const q = shuffle(await getReviewQueue(db, languageId, new Date(), await getDailyGoal(db)));
      if (q.length === 0) {
        setMenuMode('caughtup');
        setHasDue(false);
        setDueCount(0);
        setPhase('menu');
        return;
      }
      beginSession(q, q.map((item) => item.entry), count, false);
    } catch {
      setMenuMode('ready');
      setPhase('menu');
    }
  }, [db, languageId, beginSession]);

  /** Start a flashcards round from ALL words (same set every time, random order). */
  const startFree = useCallback(async () => {
    setPhase('loading');
    try {
      const difficulty = await getDifficulty(db);
      const count = choiceCountForDifficulty(difficulty);
      setChoiceCount(count);
      const picked = shuffle(await listVocabulary(db, languageId));
      if (picked.length === 0) {
        setMenuMode('caughtup');
        setHasDue(false);
        setPhase('menu');
        return;
      }
      beginSession(toQueueItems(picked), picked, count, true);
    } catch {
      setMenuMode('ready');
      setPhase('menu');
    }
  }, [db, languageId, beginSession]);

  /** Start a practice round from previously-wrong answers only. */
  const startMistakes = useCallback(async () => {
    setPhase('loading');
    try {
      const difficulty = await getDifficulty(db);
      const count = choiceCountForDifficulty(difficulty);
      setChoiceCount(count);
      const wrong = await getMistakeWords(db, languageId);
      if (wrong.length === 0) {
        setMenuMode('caughtup');
        setHasDue(false);
        setPhase('menu');
        return;
      }
      beginSession(toQueueItems(wrong), wrong, count, true);
    } catch {
      setMenuMode('ready');
      setPhase('menu');
    }
  }, [db, languageId, beginSession]);

  const current = queue[0];
  const clipToggle = useClipToggle(current?.entry.audioUri);

  function choose(choiceIndex: number) {
    if (answered || !current || advancingRef.current) return;
    const correct = choices[choiceIndex].isCorrect;
    setPicked(choiceIndex);
    setAnswered(correct ? 'correct' : 'wrong');
    setStats((s) => ({ total: s.total + 1, correct: s.correct + (correct ? 1 : 0) }));

    if (correct) {
      playEffect('correct');
    } else {
      playEffect('wrong');
      missedSet.current.add(current.entry.id);
      // A first-attempt wrong answer is recorded immediately (normal mode):
      // the word lands in the review schedule even if the child retried it
      // successfully later in the same session. Free practice never records.
      if (!freeMode && !recordedWrong.current.has(current.entry.id)) {
        recordedWrong.current.add(current.entry.id);
        recordAnswer(db, current.entry.id, 'again', Date.now() - cardShownAt.current).catch(
          () => undefined,
        );
      }
    }

    // Auto-advance — no Next button for little fingers.
    advancingRef.current = true;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(
      advance,
      correct ? ADVANCE_MS_CORRECT : ADVANCE_MS_WRONG,
    );
  }

  async function advance() {
    const snap = stateRef.current;
    const cur = snap.queue[0];
    advancingRef.current = false;
    if (!cur) return;
    const timeSpentMs = Date.now() - cardShownAt.current;

    if (!snap.freeMode && snap.answered === 'correct' && !recordedWrong.current.has(cur.entry.id)) {
      try {
        await recordAnswer(db, cur.entry.id, 'good', timeSpentMs);
      } catch {
        // The review flow must never be blocked by a persistence hiccup.
      }
    }

    // Gamification: reward a correct answer (first try pays more).
    if (snap.answered === 'correct') {
      const gained = xpForAnswer(!missedSet.current.has(cur.entry.id), streak);
      setXpGained((g) => g + gained);
      addXp(db, gained)
        .then(setXp)
        .catch(() => undefined);
    }

    const rest = snap.queue.slice(1);
    const nextQueue = snap.answered === 'wrong' ? [...rest, cur] : rest; // failed cards re-queue in-session
    setQueue(nextQueue);
    setAnswered(null);
    setPicked(null);

    if (nextQueue.length === 0) {
      setMenuMode('done');
      setPhase('menu');
    } else {
      prepareCard(nextQueue[0], snap.allEntries, choiceCount, setMode, setChoices);
      cardShownAt.current = Date.now();
      if (nextQueue[0].entry.audioUri) playClip(nextQueue[0].entry.audioUri).catch(() => undefined);
    }
  }


  if (phase === 'loading') {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (phase === 'menu') {
    const { pct, next, nextGap } = leagueInfo;
    const cta: LeaderAttrs =
      menuMode === 'done'
        ? { label: 'Play again', onPress: startFree, sub: 'Mix it up with every word' }
        : hasDue
          ? {
              label: 'Start daily practice',
              onPress: startDaily,
              sub: `${dueCount} word${dueCount === 1 ? '' : 's'} ready today`,
            }
          : { label: 'Start flashcards', onPress: startFree, sub: 'Every word in a random order' };
    const donePct = Math.round((stats.correct / Math.max(stats.total, 1)) * 100);

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.menuContent, safeEdges]}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.leagueBadge}>
              <Ionicons
                name={league.icon as React.ComponentProps<typeof Ionicons>['name']}
                size={16}
                color={c.onAccent}
              />
              <Text style={styles.leagueBadgeText}>{league.name}</Text>
            </View>
            <View style={styles.heroPills}>
              <View style={styles.pill}>
                <Ionicons name="flame" size={14} color={c.primaryDeep} />
                <Text style={styles.pillText}>{streak}</Text>
              </View>
              <View style={styles.pill}>
                <Ionicons name="star" size={14} color={c.primaryDeep} />
                <Text style={styles.pillText}>{xp} XP</Text>
              </View>
            </View>
          </View>

          {menuMode === 'done' ? (
            <>
              <Ionicons name={praise} size={46} color={c.onPrimary} />
              <Text style={styles.heroTitle}>Great job!</Text>
              <Text style={styles.heroSub}>
                {stats.correct} of {stats.total} correct ({donePct}%)
                {xpGained > 0 ? ` · +${xpGained} XP` : ''}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.heroTitle}>
                {menuMode === 'caughtup' ? 'You’re all caught up!' : 'Ready to play?'}
              </Text>
              <Text style={styles.heroSub}>
                {menuMode === 'caughtup' || !hasDue
                  ? 'Pick a game below.'
                  : `${dueCount} word${dueCount === 1 ? '' : 's'} waiting today`}
              </Text>
            </>
          )}

          {next ? (
            <>
              <Text style={styles.progressLabel}>
                {pct < 1 ? `${nextGap} XP to ${next.name}` : 'League complete!'}
              </Text>
              <View style={{ marginTop: 6 }}>
                <ProgressBar pct={pct * 100} trackColor={c.onPrimaryFaint} fillColor={c.onPrimary} height={8} />
              </View>
            </>
          ) : (
            <Text style={styles.progressLabel}>Top league reached!</Text>
          )}

          {reward ? (
            <Text style={styles.rewardHint}>
              <Ionicons name="gift-outline" size={13} color={c.onPrimaryMuted} />{' '}
              {reward.xp - xp} XP to unlock “{reward.label}”
            </Text>
          ) : null}

          <Pressable style={[childButton, styles.ctaButton]} onPress={cta.onPress}>
            <Ionicons name="play" size={30} color={c.onAccent} />
            <View style={styles.ctaTextWrap}>
              <Text style={styles.ctaText}>{cta.label}</Text>
              <Text style={styles.ctaSub}>{cta.sub}</Text>
            </View>
          </Pressable>
        </View>

        <Text style={[t.sectionTitle, styles.sectionSpacing]}>Choose a game</Text>

        <Pressable style={styles.modeRow} onPress={onRevise}>
          <View style={[styles.modeIcon, { backgroundColor: c.primarySoft }]}>
            <Ionicons name="albums-outline" size={22} color={c.primaryDeep} />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Revise words</Text>
            <Text style={t.mutedText}>Slide through cards by category</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.muted} />
        </Pressable>

        <Pressable style={styles.modeRow} onPress={startFree}>
          <View style={[styles.modeIcon, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="reader-outline" size={22} color={c.primaryDeep} />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Flashcards</Text>
            <Text style={t.mutedText}>Every word in a random order</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.muted} />
        </Pressable>

        <Pressable style={styles.modeRow} onPress={startDaily}>
          <View style={[styles.modeIcon, { backgroundColor: c.primarySoft }]}>
            <Ionicons name="calendar-number-outline" size={22} color={c.primaryDeep} />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Daily practice</Text>
            <Text style={t.mutedText}>The words scheduled for today</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.muted} />
        </Pressable>

        <Pressable style={styles.modeRow} onPress={startMistakes}>
          <View style={[styles.modeIcon, { backgroundColor: c.wrongSoft }]}>
            <Ionicons name="bicycle-outline" size={22} color={c.danger} />
          </View>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Mistakes</Text>
            <Text style={t.mutedText}>Practise words you got wrong</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.muted} />
        </Pressable>

        <Pressable onPress={onExit} hitSlop={10} style={styles.homeLink}>
          <Ionicons name="home-outline" size={16} color={c.muted} />
          <Text style={styles.homeLinkText}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    );
  }


  // Rotating card backgrounds, all from the active theme's tokens.
  const cardThemes = [c.primarySoft, c.card, c.accentSoft, c.background];
  const cardTheme = cardThemes[stats.total % cardThemes.length];
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
          <Ionicons name="close" size={24} color={c.muted} />
        </Pressable>
      </View>

      <View style={styles.stackArea}>
        <View style={[styles.stackCard, styles.stackCardFar, { backgroundColor: c.card }]} />
        <View style={[styles.stackCard, styles.stackCardNear, { backgroundColor: cardTheme }]} />
        <Pressable
          style={[styles.audioCard, { backgroundColor: cardTheme }]}
          onPress={() => {
            if (current?.entry.audioUri) {
              clipToggle.toggle();
            }
          }}
          accessibilityLabel="Hear the word, or pause the sound"
        >
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{cardNumber}</Text>
          </View>

          {mode === 'text' && current?.entry.imageUri ? (
            <CircleFrame size={136} backgroundColor={c.card} style={styles.imageCircle}>
              <WordImage uri={current.entry.imageUri} style={styles.circleImage} iconSize={60} />
            </CircleFrame>
          ) : (
            <CircleFrame size={136} backgroundColor={c.card} style={styles.imageCircle}>
              <Ionicons
                name={clipToggle.playing ? 'pause' : 'volume-high'}
                size={48}
                color={c.primary}
              />
            </CircleFrame>
          )}

          <Text style={styles.targetWord}>{current?.entry.targetText}</Text>
          <View style={styles.hintPill}>
            <Ionicons
              name={clipToggle.playing ? 'pause' : 'ear'}
              size={16}
              color={c.primaryDeep}
            />
            <Text style={styles.hintText}>
              {mode === 'image'
                ? 'Which picture is it?'
                : clipToggle.playing
                  ? 'Playing — tap to pause'
                  : 'Tap the card to hear it!'}
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
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  </View>
                )}
                {answered !== null && i === picked && !choice.isCorrect && (
                  <View style={[styles.choiceBadge, styles.choiceBadgeWrong]}>
                    <Ionicons name="close" size={18} color="#FFFFFF" />
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
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                </View>
              )}
              {answered !== null && i === picked && !choice.isCorrect && (
                <View style={[styles.choiceBadge, styles.choiceBadgeWrong]}>
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}


const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 48 },
    menuContent: { padding: 20, paddingBottom: 48 },
    center: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    hero: {
      backgroundColor: c.primary,
      borderRadius: 26,
      padding: 20,
    },
    heroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    leagueBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.onPrimaryFaint,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    leagueBadgeText: { color: c.onPrimary, fontSize: 13, fontWeight: '800' },
    heroPills: { flexDirection: 'row', gap: 8 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    pillText: { fontSize: 12, fontWeight: '800', color: c.text },
    heroTitle: { fontSize: 26, fontWeight: '800', color: c.onPrimary, marginTop: 4 },
    heroSub: { fontSize: 14, fontWeight: '600', color: c.onPrimaryMuted, marginTop: 2 },
    progressLabel: { fontSize: 12, fontWeight: '700', color: c.onPrimaryMuted, marginTop: 14 },
    rewardHint: { fontSize: 12, fontWeight: '700', color: c.onPrimaryMuted, marginTop: 10 },
    ctaButton: {
      backgroundColor: c.accent,
      alignSelf: 'stretch',
      flexDirection: 'row',
      gap: 12,
      marginTop: 18,
    },
    ctaTextWrap: { flex: 1 },
    ctaText: { fontSize: 22, fontWeight: '800', color: c.onAccent },
    ctaSub: { fontSize: 13, fontWeight: '600', color: c.onAccent, opacity: 0.85, marginTop: 1 },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.accentSoft,
      borderRadius: 16,
      padding: 12,
      marginTop: 16,
    },
    bannerText: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
    sectionSpacing: { marginTop: 24, marginBottom: 12 },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
    },
    modeIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeText: { flex: 1 },
    modeTitle: { fontSize: 15, fontWeight: '800', color: c.text, marginBottom: 2 },
    homeLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'center',
      marginTop: 20,
    },
    homeLinkText: { fontSize: 14, fontWeight: '700', color: c.muted },

    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
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
      backgroundColor: c.border,
    },
    progressDashOn: { backgroundColor: c.primary },
    progressText: { fontSize: 13, fontWeight: '800', color: c.muted },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    // Extra room below the real card for the two decorative cards to peek
    // out — matches the larger of their two `bottom` offsets below.
    stackArea: { marginBottom: 28 },
    stackCard: {
      position: 'absolute',
      borderRadius: 28,
      shadowColor: c.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    // `top` + `bottom` (instead of a guessed `height`) makes each card
    // exactly match the real card's actual rendered height, however tall
    // that turns out to be, and just peek out by a fixed pixel amount —
    // no more manually keeping a height guess in sync with the content.
    stackCardFar: { left: 10, right: 10, top: 12, bottom: -12 },
    stackCardNear: { left: 5, right: 5, top: 6, bottom: -6 },
    audioCard: {
      borderRadius: 28,
      alignItems: 'center',
      padding: 16,
      paddingTop: 14,
      shadowColor: c.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    numberBadge: {
      position: 'absolute',
      top: 14,
      left: 14,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    numberText: {
      fontSize: 16,
      fontWeight: '800',
      color: c.onDark,
      fontVariant: ['tabular-nums'],
    },
    imageCircle: { marginVertical: 10 },
    circleImage: { width: 124, height: 124, borderRadius: 62, backgroundColor: 'transparent' },
    targetWord: { ...makeTextStyles(c).titleText, fontSize: 30, textAlign: 'center', marginTop: 2 },
    hintPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    hintText: { fontSize: 14, fontWeight: '700', color: c.muted },
    choicesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    choiceIdle: { borderColor: c.primarySoft, backgroundColor: c.card },
    choiceCorrect: { borderColor: c.correct, backgroundColor: c.primarySoft },
    choiceWrong: { borderColor: c.wrong, backgroundColor: c.wrongSoft },
    choiceDim: { borderColor: c.primarySoft, backgroundColor: c.card, opacity: 0.45 },
    choiceButton: {
      width: '48.5%',
      minHeight: 78,
      borderRadius: 22,
      borderWidth: 3,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 10,
      marginBottom: 10,
      shadowColor: c.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    choiceImageWrap: {
      width: '48.5%',
      height: 104,
      borderRadius: 22,
      borderWidth: 3,
      marginBottom: 10,
      shadowColor: c.shadow,
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
      backgroundColor: c.card,
    },
    choiceImage: { width: '100%', height: '100%' },
    choiceBadge: {
      position: 'absolute',
      top: -8,
      right: -8,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.correct,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.card,
    },
    choiceBadgeWrong: { backgroundColor: c.wrong },
    choiceText: { ...makeTextStyles(c).bigText, fontSize: 19, textAlign: 'center' },
  });

