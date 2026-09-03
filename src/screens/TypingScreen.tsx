import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { makeTextStyles, useTheme, childButton, type ThemeColors } from '../theme';
import { TAB_BAR_SPACE } from '../components/TabBar';
import { playClip, playEffect, stopActiveClip, ensurePlaybackMode } from '../audio';
import { listCategories, listVocabulary, getXp, getProgressStats, addXp } from '../db/repositories';
import { gradeTypedAnswer, type TypedVerdict } from '../core/typing';
import { xpForAnswer } from '../core/gamification';
import { shuffle } from '../core/choices';
import type { Category, VocabularyEntry } from '../core/types';
import WordImage from '../components/WordImage';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  onExit: () => void;
}

type Phase = 'loading' | 'play' | 'summary';

/**
 * Type the Meaning — the child sees a Setswana word (picture + audio)
 * and types what it means in English. Every answer is graded with a
 * fair, kid-friendly matcher: case and punctuation never count against
 * them, small typos still earn credit with a gentle spelling nudge, and
 * wrong words come back at the end of the deck for another try.
 */
export default function TypingScreen({ db, languageId, onExit }: Props) {
  const [entries, setEntries] = useState<VocabularyEntry[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<number | 'all'>('all');
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<VocabularyEntry[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<TypedVerdict | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [xp, setXp] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [streak, setStreak] = useState(0);
  const missed = useRef<Set<number>>(new Set());
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);

  useEffect(() => {
    ensurePlaybackMode();
    Promise.all([
      listVocabulary(db, languageId),
      listCategories(db, languageId),
      getXp(db),
      getProgressStats(db, languageId),
    ])
      .then(([v, cats, xpTotal, stats]) => {
        setEntries(v);
        setCategories(cats);
        setXp(xpTotal);
        setStreak(stats.streakDays);
        startSession(v);
      })
      .catch(() => {
        setEntries([]);
        setPhase('play');
        setQueue([]);
      });
    return () => stopActiveClip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, languageId]);

  useEffect(() => {
    // Auto-play the current word whenever the deck moves.
    if (phase === 'play' && queue[0]?.audioUri) {
      playClip(queue[0].audioUri).catch(() => undefined);
    }
  }, [phase, queue]);

  const startSession = useCallback((deck: VocabularyEntry[]) => {
    const q = shuffle(deck);
    setQueue(q);
    setSessionTotal(q.length);
    setCorrectCount(0);
    setAttempts(0);
    setXpGained(0);
    setTyped('');
    setVerdict(null);
    missed.current = new Set();
    setPhase('play');
  }, []);

  const changeFilter = useCallback(
    (next: number | 'all') => {
      setFilter(next);
      const deck = (entries ?? []).filter(
        (e) => next === 'all' || e.categoryId === next,
      );
      startSession(deck);
    },
    [entries, startSession],
  );

  const current = queue[0];

  function check() {
    if (!current || verdict) return;
    const g = gradeTypedAnswer(current.translation, typed);
    setVerdict(g);
    setAttempts((n) => n + 1);

    if (g.correct) {
      playEffect('correct');
      setCorrectCount((n) => n + 1);
      const firstTry = !missed.current.has(current.id);
      const gained = xpForAnswer(firstTry, streak);
      setXpGained((n) => n + gained);
      addXp(db, gained)
        .then(setXp)
        .catch(() => undefined);
    } else {
      playEffect('wrong');
      missed.current.add(current.id);
    }
  }

  function next() {
    if (!verdict) return;
    const rest = queue.slice(1);
    const nextQueue = verdict.correct ? rest : [...rest, queue[0]];
    setQueue(nextQueue);
    setTyped('');
    setVerdict(null);
    if (nextQueue.length === 0) {
      setPhase('summary');
    }
  }

  if (phase === 'loading' || entries === null) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (phase === 'summary') {
    const pct = Math.round((correctCount / Math.max(attempts, 1)) * 100);
    return (
      <View style={[styles.center, styles.summary, { backgroundColor: c.background }]}>
        <View style={[styles.summaryIcon, { backgroundColor: c.primarySoft }]}>
          <Ionicons name={pct >= 70 ? 'trophy' : 'sparkles'} size={44} color={c.primaryDeep} />
        </View>
        <Text style={styles.summaryTitle}>{pct >= 70 ? 'Great work!' : 'Keep going!'}</Text>
        <Text style={styles.summaryScore}>
          {correctCount} / {attempts} correct
        </Text>
        <Text style={styles.summaryPct}>{pct}%</Text>
        <Text style={styles.summaryXp}>
          <Ionicons name="star" size={14} color={c.primary} />  +{xpGained} XP
        </Text>

        <Pressable
          style={[childButton, styles.playBtn]}
          onPress={() =>
            startSession(
              entries.filter((e) => filter === 'all' || e.categoryId === filter),
            )
          }
        >
          <Ionicons name="refresh" size={22} color={c.onPrimary} />
          <Text style={styles.playBtnText}>Play again</Text>
        </Pressable>
        <Pressable style={styles.homeBtn} onPress={onExit}>
          <Ionicons name="home-outline" size={16} color={c.muted} />
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  const isWrong = verdict !== null && !verdict.correct;
  const dashCount = Math.min(Math.max(sessionTotal, 1), 10);
  const filled = Math.max(0, sessionTotal - queue.length);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 4, paddingBottom: insets.bottom + TAB_BAR_SPACE + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable onPress={onExit} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={28} color={c.primaryDeep} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={t.titleText}>Type the meaning</Text>
            <Text style={styles.subtitle}>What does it mean in English?</Text>
          </View>
          <View style={styles.xpPill}>
            <Ionicons name="star" size={14} color={c.primary} />
            <Text style={styles.xpPillText}>{xp + xpGained}</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            style={[styles.chip, filter === 'all' && styles.chipOn]}
            onPress={() => changeFilter('all')}
          >
            <Text style={filter === 'all' ? styles.chipTextOn : styles.chipText}>
              All · {entries.length}
            </Text>
          </Pressable>
          {categories.map((cat) => {
            const on = filter === cat.id;
            const n = entries.filter((e) => e.categoryId === cat.id).length;
            return (
              <Pressable
                key={cat.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => changeFilter(on ? 'all' : cat.id)}
              >
                {cat.icon ? (
                  <Ionicons
                    name={cat.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={14}
                    color={on ? c.onPrimary : c.primaryDeep}
                  />
                ) : null}
                <Text style={on ? styles.chipTextOn : styles.chipText}>
                  {cat.name} · {n}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {current ? (
          <View style={styles.card}>
            <View style={styles.dashRow}>
              {Array.from({ length: dashCount }).map((_, i) => (
                <View key={i} style={[styles.dash, i < filled && styles.dashOn]} />
              ))}
            </View>

            <View style={styles.wordImageWrap}>
              <WordImage uri={current.imageUri} style={styles.wordImage} iconSize={54} />
            </View>

            <Text style={styles.wordText}>{current.targetText}</Text>

            <Pressable
              style={styles.listenBtn}
              onPress={() => playClip(current.audioUri ?? '').catch(() => undefined)}
            >
              <Ionicons name="volume-high" size={20} color={c.onPrimary} />
              <Text style={styles.listenText}>Hear it again</Text>
            </Pressable>
            <View
              style={[
                styles.inputWrap,
                verdict !== null &&
                  (verdict.correct ? styles.inputWrapCorrect : styles.inputWrapWrong),
              ]}
            >
              <TextInput
                style={styles.input}
                value={typed}
                onChangeText={setTyped}
                editable={verdict === null}
                placeholder="Type the English meaning…"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={check}
              />
            </View>

            {verdict !== null && (
              <View
                style={[
                  styles.verdictBox,
                  verdict.correct ? styles.verdictCorrect : styles.verdictWrong,
                ]}
              >
                <Ionicons
                  name={
                    verdict.correct
                      ? verdict.grade === 'exact'
                        ? 'checkmark-circle'
                        : 'thumbs-up'
                      : 'close-circle'
                  }
                  size={26}
                  color={verdict.correct ? c.correct : c.danger}
                />
                <Text style={[styles.verdictText, { color: verdict.correct ? c.correct : c.danger }]}>
                  {verdict.grade === 'exact'
                    ? 'Exactly right!'
                    : verdict.grade === 'close'
                      ? `Almost — it's “${current.translation}”`
                      : `Not quite — it's “${current.translation}”`}
                </Text>
              </View>
            )}

            {verdict === null ? (
              <Pressable
                style={[childButton, styles.checkBtn, (!typed.trim() || !current) && styles.disabled]}
                onPress={check}
                disabled={!typed.trim() || !current}
              >
                <Ionicons name="checkmark" size={22} color={c.onPrimary} />
                <Text style={styles.checkText}>Check</Text>
              </Pressable>
            ) : (
              <Pressable style={[childButton, styles.checkBtn]} onPress={next}>
                <Ionicons name="arrow-forward" size={22} color={c.onPrimary} />
                <Text style={styles.checkText}>
                  {isWrong ? 'Try again next' : 'Next word'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="create-outline" size={44} color={c.muted} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyHint}>
              Add some words first, or pick a different category.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingBottom: 48 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    subtitle: { fontSize: 13, color: c.muted, marginTop: 2 },
    xpPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.card,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    xpPillText: { color: c.text, fontWeight: '800', fontSize: 14 },

    chipsRow: { gap: 8, paddingVertical: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.primarySoft,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { color: c.text, fontWeight: '600', fontSize: 13 },
    chipTextOn: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },

    card: {
      backgroundColor: c.card,
      borderRadius: 24,
      padding: 20,
      marginTop: 10,
      alignItems: 'center',
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    dashRow: { flexDirection: 'row', gap: 5, alignSelf: 'flex-start', marginBottom: 12 },
    dash: {
      width: 18,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.primarySoft,
    },
    dashOn: { backgroundColor: c.primary },
    wordImageWrap: {
      width: 140,
      height: 140,
      borderRadius: 24,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wordImage: { width: 130, height: 130, borderRadius: 22 },
    wordText: { marginTop: 18, fontSize: 40, fontWeight: '800', color: c.text },
    listenBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: c.primary,
      borderRadius: 22,
      paddingHorizontal: 18,
      paddingVertical: 10,
      marginTop: 14,
    },
    listenText: { color: c.onPrimary, fontWeight: '800', fontSize: 14 },

    inputWrap: {
      width: '100%',
      marginTop: 20,
      borderWidth: 2,
      borderColor: c.primarySoft,
      borderRadius: 14,
      backgroundColor: c.background,
      paddingHorizontal: 14,
      paddingVertical: 2,
    },
    inputWrapCorrect: { borderColor: c.correct },
    inputWrapWrong: { borderColor: c.danger },
    input: { fontSize: 18, color: c.text, paddingVertical: 10 },

    verdictBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      marginTop: 14,
      borderRadius: 14,
      padding: 12,
    },
    verdictCorrect: { backgroundColor: c.accentSoft },
    verdictWrong: { backgroundColor: c.wrongSoft },
    verdictText: { flex: 1, fontSize: 16, fontWeight: '700' },

    checkBtn: {
      width: '100%',
      marginTop: 16,
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 16,
    },
    checkText: { fontSize: 20, fontWeight: '800', color: c.onPrimary },
    disabled: { opacity: 0.5 },

    empty: { alignItems: 'center', marginTop: 48, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    emptyHint: { fontSize: 14, color: c.muted, textAlign: 'center' },

    summary: { padding: 32, gap: 6 },
    summaryIcon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    summaryTitle: { fontSize: 28, fontWeight: '800', color: c.text, marginTop: 6 },
    summaryScore: { fontSize: 20, fontWeight: '700', color: c.text, marginTop: 4 },
    summaryPct: { fontSize: 16, color: c.muted, fontWeight: '600' },
    summaryXp: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 4 },
    playBtn: {
      marginTop: 20,
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 16,
      paddingHorizontal: 28,
    },
    playBtnText: { fontSize: 19, fontWeight: '800', color: c.onPrimary },
    homeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    homeBtnText: { color: c.muted, fontWeight: '600' },
  });