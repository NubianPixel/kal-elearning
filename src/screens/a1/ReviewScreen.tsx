import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import { items, type Question } from '../../content';
import { loadDueCardStates, loadCardStates, reviewedToday, recordReview, type CardStateRow } from '../../db/progress';
import { buildReviewQueue } from '../../core/daily';
import { buildReviewQuestion } from '../../core/reviewQuestion';
import { buildRecallQuestion, gradeRecallAnswer, type RecallQuestion } from '../../core/questions';
import { gradeTypedAnswer } from '../../core/typing';
import { shuffle } from '../../core/choices';
import type { CardType } from '../../core/srs';
import { ensurePlaybackMode, playEffect, stopActiveClip } from '../../audio';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { REVIEW_CAP, checkAndMarkGoal } from './pathData';
import ChoiceOptions from './questions/ChoiceOptions';
import TypedAnswerInput from './questions/TypedAnswerInput';
import FeedbackPanel from './questions/FeedbackPanel';
import ListeningPrompt from './questions/ListeningPrompt';

interface Props {
  db: SQLite.SQLiteDatabase;
  /** Learner tapped "Back to Home" at the summary screen. */
  onFinish: () => void;
}

type QueueRow = { cardType: CardType; itemId: string };

/** The current card flattened to what the UI needs — built once per card. */
type ActiveCard =
  | { cardType: CardType; itemId: string; ui: 'listen-choice'; audioId: string; fallbackText: string; options: string[]; answer: string; note: string | null }
  | { cardType: CardType; itemId: string; ui: 'recall-type'; recall: RecallQuestion; note: string | null }
  | { cardType: CardType; itemId: string; ui: 'drill-choice'; prompt: string; options: string[]; answer: string; note: string | null }
  | { cardType: CardType; itemId: string; ui: 'drill-type'; question: Question; note: string | null };

function buildActiveCard(row: QueueRow, pool: typeof items): ActiveCard | null {
  const q = buildReviewQuestion(row.cardType, row.itemId, pool);
  if (!q) return null;

  if (q.cardType === 'listen') {
    if (q.listening) {
      return {
        cardType: 'listen',
        itemId: row.itemId,
        ui: 'listen-choice',
        audioId: q.item.id,
        fallbackText: q.item.setswana,
        options: q.listening.options,
        answer: q.listening.answer,
        note: q.item.note,
      };
    }
    // Too few distractors to build a listening question — fall back to recall.
    return { cardType: 'listen', itemId: row.itemId, ui: 'recall-type', recall: buildRecallQuestion(q.item), note: q.item.note };
  }

  if (q.cardType === 'recall') {
    return { cardType: 'recall', itemId: row.itemId, ui: 'recall-type', recall: q.recall, note: q.item.note };
  }

  // drill
  if (q.question.format === 'choice') {
    return {
      cardType: 'drill',
      itemId: row.itemId,
      ui: 'drill-choice',
      prompt: q.question.prompt,
      options: shuffle([q.question.answer, ...q.question.distractors]),
      answer: q.question.answer,
      note: q.question.explanation,
    };
  }
  return { cardType: 'drill', itemId: row.itemId, ui: 'drill-type', question: q.question, note: q.question.explanation };
}

function poolFrom(cardStates: CardStateRow[]): typeof items {
  const introducedIds = new Set(cardStates.filter((c) => c.cardType === 'recall').map((c) => c.itemId));
  return items.filter((i) => introducedIds.has(i.id));
}

/** Review session: capped due queue, most overdue first, graded per SM-2. */
export default function ReviewScreen({ db, onFinish }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const [phase, setPhase] = useState<'loading' | 'active' | 'summary'>('loading');
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [card, setCard] = useState<ActiveCard | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  // Reviews answered since the last queue (re)load — lets "continue" reuse
  // the loaded queue instead of re-querying + rebuilding after every session.
  const consumedRef = useRef(0);

  const shownAt = useRef(Date.now());
  const poolRef = useRef<typeof items>(items);

  useEffect(() => {
    ensurePlaybackMode();
    return () => stopActiveClip();
  }, []);

  const loadQueue = useCallback(async () => {
    setPhase('loading');
    const now = new Date();
    const [dueRows, reviewedCount, cardStates] = await Promise.all([
      loadDueCardStates(db, now),
      reviewedToday(db, now),
      loadCardStates(db),
    ]);
    poolRef.current = poolFrom(cardStates);
    const remainingCap = Math.max(0, REVIEW_CAP - reviewedCount);
    const capped = buildReviewQueue(dueRows, now, remainingCap);
    if (capped.length === 0) {
      setPhase('summary');
      return;
    }
    const rows: QueueRow[] = capped.map((r) => ({ cardType: r.cardType, itemId: r.itemId }));
    consumedRef.current = 0;
    setQueue(rows);
    setCard(buildActiveCard(rows[0], poolRef.current));
    setSelected(null);
    setTyped('');
    setAnswered(false);
    shownAt.current = Date.now();
    setPhase('active');
  }, [db]);

  useEffect(() => {
    loadQueue().catch(() => setPhase('summary'));
  }, [loadQueue]);

  const submit = useCallback(
    (isCorrect: boolean) => {
      if (!card || answered) return;
      setAnswered(true);
      setCorrect(isCorrect);
      consumedRef.current += 1;
      setStats((s) => ({ total: s.total + 1, correct: s.correct + (isCorrect ? 1 : 0) }));
      playEffect(isCorrect ? 'correct' : 'wrong');
      const ms = Date.now() - shownAt.current;
      recordReview(db, card.itemId, card.cardType, isCorrect, ms).catch(() => undefined);
      void checkAndMarkGoal(db);
    },
    [card, answered, db],
  );

  function chooseOption(index: number) {
    if (!card || answered || (card.ui !== 'listen-choice' && card.ui !== 'drill-choice')) return;
    setSelected(index);
    submit(card.options[index] === card.answer);
  }

  function submitTyped() {
    if (!card || answered || !typed.trim()) return;
    if (card.ui === 'recall-type') {
      submit(gradeRecallAnswer(card.recall, typed, items).correct);
    } else if (card.ui === 'drill-type') {
      const candidates = [card.question.answer, ...card.question.answerAlt];
      const bestCorrect = candidates.some((cand) => gradeTypedAnswer(cand, typed).correct);
      submit(bestCorrect);
    }
  }

  function continueSession() {
    const rest = queue.slice(1);
    if (rest.length === 0) {
      // Cards answered since this queue was loaded are now due again
      // (failed cards reschedule to interval 0), so only reload once every
      // card has been answered; otherwise just move to the next queued row.
      if (consumedRef.current >= stats.total) {
        loadQueue().catch(() => setPhase('summary'));
      } else {
        setQueue([]);
        setCard(null);
        setPhase('summary');
      }
      return;
    }
    setQueue(rest);
    setCard(buildActiveCard(rest[0], poolRef.current));
    setSelected(null);
    setTyped('');
    setAnswered(false);
    shownAt.current = Date.now();
  }

  if (phase === 'loading') {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (phase === 'summary') {
    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.summaryContent, safeEdges]}>
        <View style={styles.summaryCard}>
          <Ionicons name={stats.total ? 'trophy' : 'checkmark-circle'} size={48} color={c.primary} />
          <Text style={styles.summaryTitle}>{stats.total ? 'Nice work!' : 'All caught up!'}</Text>
          {stats.total ? (
            <Text style={styles.summarySub}>
              {stats.correct} of {stats.total} correct ({pct}%)
            </Text>
          ) : (
            <Text style={styles.summarySub}>No reviews were due — check back later.</Text>
          )}
        </View>
        <Pressable style={[primaryButton, styles.finishButton]} onPress={onFinish} accessibilityLabel="Back to Home">
          <Text style={styles.finishText}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!card) {
    return (
      <View style={[styles.center, safeEdges]}>
        <Text style={t.mutedText}>Something went wrong loading this card.</Text>
      </View>
    );
  }

  const progressLabel = `${stats.total + 1} of ${stats.total + queue.length}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
      <Text style={styles.progressText}>{progressLabel}</Text>

      {card.ui === 'listen-choice' && (
        <>
          <ListeningPrompt audioId={card.audioId} fallbackText={card.fallbackText} />
          <View style={styles.spacer} />
          <ChoiceOptions
            options={card.options}
            selected={selected}
            answered={answered}
            correctAnswer={card.answer}
            onSelect={chooseOption}
          />
        </>
      )}

      {card.ui === 'recall-type' && (
        <>
          <Text style={styles.prompt}>{card.recall.prompt}</Text>
          <TypedAnswerInput value={typed} onChange={setTyped} onSubmit={submitTyped} answered={answered} placeholder="Type it in Setswana" />
        </>
      )}

      {card.ui === 'drill-choice' && (
        <>
          <Text style={styles.prompt}>{card.prompt}</Text>
          <ChoiceOptions
            options={card.options}
            selected={selected}
            answered={answered}
            correctAnswer={card.answer}
            onSelect={chooseOption}
          />
        </>
      )}

      {card.ui === 'drill-type' && (
        <>
          <Text style={styles.prompt}>{card.question.prompt}</Text>
          <TypedAnswerInput value={typed} onChange={setTyped} onSubmit={submitTyped} answered={answered} />
        </>
      )}

      {answered && (
        <FeedbackPanel
          correct={correct}
          correctAnswer={
            card.ui === 'listen-choice' || card.ui === 'drill-choice'
              ? card.answer
              : card.ui === 'recall-type'
                ? card.recall.answer
                : card.question.answer
          }
          note={card.note}
          onContinue={continueSession}
        />
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    summaryContent: { padding: 20, flexGrow: 1, justifyContent: 'center' },
    center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
    progressText: { fontSize: 13, fontWeight: '800', color: c.muted, marginBottom: 12 },
    spacer: { height: 16 },
    prompt: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 16, textAlign: 'center' },
    summaryCard: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 24,
      padding: 28,
      ...cardShadow(c, 'md'),
    },
    summaryTitle: { fontSize: 24, fontWeight: '800', color: c.text, marginTop: 10 },
    summarySub: { fontSize: 15, fontWeight: '600', color: c.muted, marginTop: 6, textAlign: 'center' },
    finishButton: { backgroundColor: c.primary, marginTop: 20 },
    finishText: { fontSize: 17, fontWeight: '800', color: c.onPrimary },
  });
