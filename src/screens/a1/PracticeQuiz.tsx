import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import type { Item } from '../../content';
import { buildListeningQuestion, buildRecallQuestion, gradeRecallAnswer, type RecallQuestion } from '../../core/questions';
import { playEffect } from '../../audio';
import ChoiceOptions from './questions/ChoiceOptions';
import TypedAnswerInput from './questions/TypedAnswerInput';
import FeedbackPanel from './questions/FeedbackPanel';
import ListeningPrompt from './questions/ListeningPrompt';

const ROUND_SIZE = 10;

type PracticeCard =
  | { ui: 'listen-choice'; itemId: string; fallbackText: string; options: string[]; answer: string; note: string | null }
  | { ui: 'recall-type'; itemId: string; recall: RecallQuestion; note: string | null };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Randomly a listening or recall question for `item` — falls back to
 *  recall when there aren't enough distractors for a listening question. */
function buildPracticeCard(item: Item, distractorPool: Item[]): PracticeCard {
  if (Math.random() < 0.5) {
    const q = buildListeningQuestion(item, distractorPool);
    if (q) {
      return {
        ui: 'listen-choice',
        itemId: item.id,
        fallbackText: item.setswana,
        options: q.options,
        answer: q.answer,
        note: item.note,
      };
    }
  }
  return { ui: 'recall-type', itemId: item.id, recall: buildRecallQuestion(item), note: item.note };
}

interface Props {
  /** This round's item pool (e.g. recent mistakes, or every introduced item). */
  items: Item[];
  /** Listening distractor pool — every introduced item, regardless of `items`. */
  distractorPool: Item[];
  emptyTitle: string;
  emptyBody: string;
}

/**
 * Shared runner for Practice's "Mistakes" and "Flashcards" modes: random
 * listening/recall questions over a fixed pool, tap-to-continue, no SRS or
 * goal writes at all (free practice, per spec).
 */
export default function PracticeQuiz({ items, distractorPool, emptyTitle, emptyBody }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);

  const [round, setRound] = useState<PracticeCard[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  const [phase, setPhase] = useState<'active' | 'summary'>('active');

  const startRound = useCallback(() => {
    const picked = shuffle(items).slice(0, ROUND_SIZE);
    setRound(picked.map((item) => buildPracticeCard(item, distractorPool)));
    setIndex(0);
    setSelected(null);
    setTyped('');
    setAnswered(false);
    setStats({ total: 0, correct: 0 });
    setPhase('active');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, distractorPool]);

  useEffect(() => {
    startRound();
  }, [startRound]);

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="happy-outline" size={40} color={c.muted} />
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={t.mutedText}>{emptyBody}</Text>
      </View>
    );
  }

  const card = round[index];

  function submit(isCorrect: boolean) {
    if (!card || answered) return;
    setAnswered(true);
    setCorrect(isCorrect);
    setStats((s) => ({ total: s.total + 1, correct: s.correct + (isCorrect ? 1 : 0) }));
    playEffect(isCorrect ? 'correct' : 'wrong');
  }

  function chooseOption(i: number) {
    if (!card || card.ui !== 'listen-choice') return;
    setSelected(i);
    submit(card.options[i] === card.answer);
  }

  function submitTyped() {
    if (!card || card.ui !== 'recall-type' || !typed.trim()) return;
    submit(gradeRecallAnswer(card.recall, typed).correct);
  }

  function next() {
    const nextIndex = index + 1;
    if (nextIndex >= round.length) {
      setPhase('summary');
      return;
    }
    setIndex(nextIndex);
    setSelected(null);
    setTyped('');
    setAnswered(false);
  }

  if (phase === 'summary') {
    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    return (
      <View style={styles.center}>
        <Ionicons name="trophy" size={40} color={c.primary} />
        <Text style={styles.emptyTitle}>Round done!</Text>
        <Text style={t.mutedText}>
          {stats.correct} of {stats.total} correct ({pct}%)
        </Text>
        <Pressable style={[primaryButton, styles.again]} onPress={startRound} accessibilityLabel="Practice again">
          <Text style={styles.againText}>Practice again</Text>
        </Pressable>
      </View>
    );
  }

  if (!card) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.progressText}>
        {index + 1} of {round.length}
      </Text>

      {card.ui === 'listen-choice' && (
        <>
          <ListeningPrompt audioId={card.itemId} fallbackText={card.fallbackText} />
          <View style={{ height: 16 }} />
          <ChoiceOptions options={card.options} selected={selected} answered={answered} correctAnswer={card.answer} onSelect={chooseOption} />
        </>
      )}
      {card.ui === 'recall-type' && (
        <>
          <Text style={styles.prompt}>{card.recall.prompt}</Text>
          <TypedAnswerInput value={typed} onChange={setTyped} onSubmit={submitTyped} answered={answered} placeholder="Type it in Setswana" />
        </>
      )}

      {answered && (
        <FeedbackPanel
          correct={correct}
          correctAnswer={card.ui === 'listen-choice' ? card.answer : card.recall.answer}
          note={card.note}
          onContinue={next}
        />
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 20 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center' },
    progressText: { fontSize: 13, fontWeight: '800', color: c.muted, marginBottom: 12 },
    prompt: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 16, textAlign: 'center' },
    again: { backgroundColor: c.primary, marginTop: 8 },
    againText: { fontSize: 16, fontWeight: '800', color: c.onPrimary },
  });
