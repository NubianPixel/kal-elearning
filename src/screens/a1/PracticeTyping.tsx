import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import type { Item } from '../../content';
import { buildRecallQuestion, gradeRecallAnswer } from '../../core/questions';
import { gradeTypedAnswer } from '../../core/typing';
import { playEffect } from '../../audio';
import TypedAnswerInput from './questions/TypedAnswerInput';
import FeedbackPanel from './questions/FeedbackPanel';

const ROUND_SIZE = 10;
type Direction = 'en-tn' | 'tn-en';

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Props {
  items: Item[];
}

/** Typing practice: type the Setswana (English→Setswana) or the English
 *  meaning (Setswana→English), toggled by direction. Free practice — no
 *  SRS or goal writes. */
export default function PracticeTyping({ items }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);

  const [direction, setDirection] = useState<Direction>('en-tn');
  const [round, setRound] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [phase, setPhase] = useState<'active' | 'summary'>('active');
  const [stats, setStats] = useState({ total: 0, correct: 0 });

  const startRound = useCallback(() => {
    setRound(shuffle(items).slice(0, ROUND_SIZE));
    setIndex(0);
    setTyped('');
    setAnswered(false);
    setStats({ total: 0, correct: 0 });
    setPhase('active');
  }, [items]);

  useEffect(() => {
    startRound();
  }, [startRound]);

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="create-outline" size={40} color={c.muted} />
        <Text style={styles.emptyTitle}>Nothing to type yet</Text>
        <Text style={t.mutedText}>Start Unit 1 on Home to introduce your first words.</Text>
      </View>
    );
  }

  const item = round[index];

  function submitTyped() {
    if (!item || answered || !typed.trim()) return;
    const isCorrect =
      direction === 'en-tn'
        ? gradeRecallAnswer(buildRecallQuestion(item), typed).correct
        : item.english.some((en) => gradeTypedAnswer(en, typed).correct);
    setAnswered(true);
    setCorrect(isCorrect);
    setStats((s) => ({ total: s.total + 1, correct: s.correct + (isCorrect ? 1 : 0) }));
    playEffect(isCorrect ? 'correct' : 'wrong');
  }

  function next() {
    const nextIndex = index + 1;
    if (nextIndex >= round.length) {
      setPhase('summary');
      return;
    }
    setIndex(nextIndex);
    setTyped('');
    setAnswered(false);
  }

  function switchDirection(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    startRound();
  }

  const directionSwitch = (
    <View style={styles.directionRow}>
      <Pressable
        style={[styles.directionButton, direction === 'en-tn' && styles.directionButtonActive]}
        onPress={() => switchDirection('en-tn')}
        accessibilityLabel="English to Setswana"
      >
        <Text style={[styles.directionText, direction === 'en-tn' && styles.directionTextActive]}>English → Setswana</Text>
      </Pressable>
      <Pressable
        style={[styles.directionButton, direction === 'tn-en' && styles.directionButtonActive]}
        onPress={() => switchDirection('tn-en')}
        accessibilityLabel="Setswana to English"
      >
        <Text style={[styles.directionText, direction === 'tn-en' && styles.directionTextActive]}>Setswana → English</Text>
      </Pressable>
    </View>
  );

  if (phase === 'summary') {
    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {directionSwitch}
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
      </ScrollView>
    );
  }

  if (!item) return null;

  const prompt = direction === 'en-tn' ? buildRecallQuestion(item).prompt : item.setswana;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {directionSwitch}
      <Text style={styles.progressText}>
        {index + 1} of {round.length}
      </Text>
      <Text style={styles.prompt}>{prompt}</Text>
      <TypedAnswerInput
        value={typed}
        onChange={setTyped}
        onSubmit={submitTyped}
        answered={answered}
        placeholder={direction === 'en-tn' ? 'Type it in Setswana' : 'Type it in English'}
      />
      {answered && (
        <FeedbackPanel
          correct={correct}
          correctAnswer={direction === 'en-tn' ? item.setswana : item.english[0]}
          note={item.note}
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
    center: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center' },
    progressText: { fontSize: 13, fontWeight: '800', color: c.muted, marginBottom: 12 },
    prompt: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 16, textAlign: 'center' },
    again: { backgroundColor: c.primary, marginTop: 8 },
    againText: { fontSize: 16, fontWeight: '800', color: c.onPrimary },
    directionRow: { flexDirection: 'row', gap: 8, marginBottom: 16, ...cardShadow(c, 'sm') },
    directionButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    directionButtonActive: { backgroundColor: c.primary },
    directionText: { fontSize: 13, fontWeight: '800', color: c.muted, textAlign: 'center' },
    directionTextActive: { color: c.onPrimary },
  });
