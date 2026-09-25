import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import { grammarForUnit, questionsForUnit, units } from '../../content';
import {
  markStepComplete,
  type ProgressDb,
} from '../../db/progress';
import { gradeTypedAnswer } from '../../core/typing';
import { shuffle } from '../../core/choices';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { checkAndMarkGoal } from './pathData';
import ChoiceOptions from './questions/ChoiceOptions';
import TypedAnswerInput from './questions/TypedAnswerInput';
import FeedbackPanel from './questions/FeedbackPanel';

interface Props {
  db: ProgressDb;
  unit: number;
  onDone: () => void;
}

/** Grammar step: the unit's grammar note, then its drill questions as ungraded practice. */
export default function GrammarStep({ db, unit, onDone }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const rows = useMemo(() => grammarForUnit(unit), [unit]);
  const drills = useMemo(() => questionsForUnit(unit, 'drill'), [unit]);
  const unitInfo = units.find((u) => u.unit === unit);

  const [phase, setPhase] = useState<'notes' | 'practice' | 'done'>('notes');
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [stats, setStats] = useState({ total: 0, correct: 0 });

  function startPractice() {
    if (drills.length === 0) {
      finish();
      return;
    }
    setIndex(0);
    setOptions(drills[0].format === 'choice' ? shuffle([drills[0].answer, ...drills[0].distractors]) : []);
    setSelected(null);
    setTyped('');
    setAnswered(false);
    setStats({ total: 0, correct: 0 });
    setPhase('practice');
  }

  function submit(isCorrect: boolean) {
    setAnswered(true);
    setCorrect(isCorrect);
    setStats((s) => ({ total: s.total + 1, correct: s.correct + (isCorrect ? 1 : 0) }));
  }

  function chooseOption(i: number) {
    if (answered) return;
    setSelected(i);
    submit(options[i] === drills[index].answer);
  }

  function submitTyped() {
    if (answered || !typed.trim()) return;
    const q = drills[index];
    const candidates = [q.answer, ...q.answerAlt];
    submit(candidates.some((cand) => gradeTypedAnswer(cand, typed).correct));
  }

  function nextQuestion() {
    const nextIndex = index + 1;
    if (nextIndex >= drills.length) {
      finish();
      return;
    }
    setIndex(nextIndex);
    setOptions(drills[nextIndex].format === 'choice' ? shuffle([drills[nextIndex].answer, ...drills[nextIndex].distractors]) : []);
    setSelected(null);
    setTyped('');
    setAnswered(false);
  }

  async function finish() {
    await markStepComplete(db, unit, 'grammar');
    await checkAndMarkGoal(db);
    setPhase('done');
  }

  if (phase === 'notes') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
        <Text style={t.sectionTitle}>{unitInfo?.grammarTitle ?? 'Grammar'}</Text>
        {rows.map((row, i) =>
          row.type === 'text' ? (
            <Text key={i} style={styles.paragraph}>
              {row.textOrSetswana}
            </Text>
          ) : (
            <View key={i} style={styles.exampleRow}>
              <Text style={styles.exampleSt}>{row.textOrSetswana}</Text>
              {row.english ? <Text style={styles.exampleEn}>{row.english}</Text> : null}
            </View>
          ),
        )}
        <Pressable style={[primaryButton, styles.ctaButton]} onPress={startPractice} accessibilityLabel="Practise this grammar point">
          <Text style={styles.ctaText}>{drills.length ? 'Practise it' : 'Continue'}</Text>
          <Ionicons name="arrow-forward" size={20} color={c.onAccent} />
        </Pressable>
      </ScrollView>
    );
  }

  if (phase === 'done') {
    const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 100;
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.doneContent, safeEdges]}>
        <Ionicons name="checkmark-circle" size={48} color={c.primary} />
        <Text style={styles.doneTitle}>Grammar done!</Text>
        {stats.total ? (
          <Text style={t.mutedText}>
            {stats.correct} of {stats.total} correct ({pct}%)
          </Text>
        ) : null}
        <Pressable style={[primaryButton, styles.ctaButton]} onPress={onDone} accessibilityLabel="Continue">
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // practice
  const q = drills[index];
  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
      <Text style={styles.progressText}>
        {index + 1} of {drills.length}
      </Text>
      <Text style={styles.prompt}>{q.prompt}</Text>
      {q.format === 'choice' ? (
        <ChoiceOptions options={options} selected={selected} answered={answered} correctAnswer={q.answer} onSelect={chooseOption} />
      ) : (
        <TypedAnswerInput value={typed} onChange={setTyped} onSubmit={submitTyped} answered={answered} />
      )}
      {answered && (
        <FeedbackPanel correct={correct} correctAnswer={q.answer} note={q.explanation} onContinue={nextQuestion} />
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    doneContent: { padding: 20, alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: 8 },
    paragraph: { fontSize: 15, fontWeight: '600', color: c.text, marginTop: 14, lineHeight: 22 },
    exampleRow: {
      marginTop: 10,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      ...cardShadow(c, 'sm'),
    },
    exampleSt: { fontSize: 16, fontWeight: '800', color: c.text },
    exampleEn: { fontSize: 14, fontWeight: '600', color: c.muted, marginTop: 2 },
    ctaButton: { backgroundColor: c.accent, flexDirection: 'row', gap: 8, marginTop: 24 },
    ctaText: { fontSize: 17, fontWeight: '800', color: c.onAccent },
    progressText: { fontSize: 13, fontWeight: '800', color: c.muted, marginBottom: 12 },
    prompt: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 16 },
    doneTitle: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 8 },
  });
