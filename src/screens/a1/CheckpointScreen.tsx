import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import { items, itemById, itemsForUnit, dialogueForUnit, type DialogueLine, type Question } from '../../content';
import { buildCheckpoint, scoreCheckpoint, type CheckpointQuestion, type CheckpointResult, type Skill } from '../../core/checkpoint';
import type { RecallQuestion } from '../../core/questions';
import { gradeRecallAnswer } from '../../core/questions';
import { gradeTypedAnswer } from '../../core/typing';
import { shuffle } from '../../core/choices';
import { unitStatus } from '../../core/path';
import { loadCardStates, passedUnits, saveCheckpointAttempt } from '../../db/progress';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import ChoiceOptions from './questions/ChoiceOptions';
import TypedAnswerInput from './questions/TypedAnswerInput';
import FeedbackPanel from './questions/FeedbackPanel';
import ListeningPrompt from './questions/ListeningPrompt';

interface Props {
  db: SQLite.SQLiteDatabase;
  /** Unit being checkpointed/tested-out, or null for the A1 exit test. */
  unit: number | null;
  onDone: () => void;
}

type ActiveCard =
  | { skill: 'listening'; refId: string; ui: 'listen-choice'; audioId: string; fallbackText: string; options: string[]; answer: string; note: string | null }
  | { skill: 'recall'; refId: string; ui: 'recall-type'; recall: RecallQuestion; note: string | null }
  | { skill: 'grammar' | 'reading'; refId: string; ui: 'choice'; prompt: string; options: string[]; answer: string; note: string | null; dialogue?: DialogueLine[] }
  | { skill: 'grammar' | 'reading'; refId: string; ui: 'type'; question: Question; note: string | null; dialogue?: DialogueLine[] };

function answerTextFor(card: ActiveCard | undefined): string | undefined {
  if (!card) return undefined;
  if (card.ui === 'listen-choice' || card.ui === 'choice') return card.answer;
  if (card.ui === 'recall-type') return card.recall.answer;
  return card.question.answer;
}

function buildActiveCard(cq: CheckpointQuestion): ActiveCard {
  if (cq.skill === 'listening') {
    const item = itemById(cq.question.itemId);
    return {
      skill: 'listening',
      refId: cq.question.itemId,
      ui: 'listen-choice',
      audioId: cq.question.itemId,
      fallbackText: item?.setswana ?? cq.question.answer,
      options: cq.question.options,
      answer: cq.question.answer,
      note: item?.note ?? null,
    };
  }
  if (cq.skill === 'recall') {
    const item = itemById(cq.question.itemId);
    return { skill: 'recall', refId: cq.question.itemId, ui: 'recall-type', recall: cq.question, note: item?.note ?? null };
  }
  const dialogue = cq.skill === 'reading' ? dialogueForUnit(cq.question.unit) : undefined;
  if (cq.question.format === 'choice') {
    return {
      skill: cq.skill,
      refId: cq.question.id,
      ui: 'choice',
      prompt: cq.question.prompt,
      options: shuffle([cq.question.answer, ...cq.question.distractors]),
      answer: cq.question.answer,
      note: cq.question.explanation,
      dialogue,
    };
  }
  return { skill: cq.skill, refId: cq.question.id, ui: 'type', question: cq.question, note: cq.question.explanation, dialogue };
}

/** Every item ever introduced (any unit) — the checkpoint's listening distractor pool, when the unit has been studied. */
async function introducedPool(db: SQLite.SQLiteDatabase) {
  const cardStates = await loadCardStates(db);
  const ids = new Set(cardStates.filter((c) => c.cardType === 'recall').map((c) => c.itemId));
  return items.filter((i) => ids.has(i.id));
}

async function resolvePool(db: SQLite.SQLiteDatabase, unit: number | null) {
  const pool = await introducedPool(db);
  if (unit === null) return pool.length ? pool : items;
  const passed = await passedUnits(db);
  // "Test out": the unit was never studied, so there's no introduced pool
  // for it — use its own items as the distractor pool instead.
  if (unitStatus(unit, passed) === 'locked') return itemsForUnit(unit);
  return pool.length ? pool : itemsForUnit(unit);
}

const SKILL_LABEL: Record<Skill, string> = {
  listening: 'Listening',
  recall: 'Recall',
  grammar: 'Grammar',
  reading: 'Reading',
};

/** Checkpoint runner: listening/recall/grammar/reading questions, 80% overall + 60%/skill to pass. No SRS writes. */
export default function CheckpointScreen({ db, unit, onDone }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const [phase, setPhase] = useState<'loading' | 'intro' | 'running' | 'result'>('loading');
  const [cards, setCards] = useState<ActiveCard[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [results, setResults] = useState<CheckpointResult[]>([]);
  const [score, setScore] = useState<ReturnType<typeof scoreCheckpoint> | null>(null);

  const startAttempt = useCallback(async () => {
    setPhase('loading');
    const pool = await resolvePool(db, unit);
    const checkpoint = buildCheckpoint(unit, { introducedPool: pool });
    setCards(checkpoint.questions.map(buildActiveCard));
    setIndex(0);
    setResults([]);
    setSelected(null);
    setTyped('');
    setAnswered(false);
    setScore(null);
    setPhase('intro');
  }, [db, unit]);

  useEffect(() => {
    startAttempt().catch(() => setPhase('intro'));
  }, [startAttempt]);

  function begin() {
    setPhase('running');
  }

  function record(isCorrect: boolean) {
    const card = cards[index];
    setAnswered(true);
    setCorrect(isCorrect);
    setResults((r) => [...r, { skill: card.skill, refId: card.refId, correct: isCorrect }]);
  }

  function chooseOption(i: number) {
    const card = cards[index];
    if (answered || (card.ui !== 'listen-choice' && card.ui !== 'choice')) return;
    setSelected(i);
    record(card.options[i] === card.answer);
  }

  function submitTyped() {
    const card = cards[index];
    if (answered || !typed.trim()) return;
    if (card.ui === 'recall-type') {
      record(gradeRecallAnswer(card.recall, typed, items).correct);
    } else if (card.ui === 'type') {
      const candidates = [card.question.answer, ...card.question.answerAlt];
      record(candidates.some((cand) => gradeTypedAnswer(cand, typed).correct));
    }
  }

  async function next() {
    const nextIndex = index + 1;
    if (nextIndex < cards.length) {
      setIndex(nextIndex);
      setSelected(null);
      setTyped('');
      setAnswered(false);
      return;
    }
    const finalScore = scoreCheckpoint(results);
    setScore(finalScore);
    await saveCheckpointAttempt(db, unit, finalScore);
    setPhase('result');
  }

  if (phase === 'loading') {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (phase === 'intro') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
        <Text style={t.sectionTitle}>{unit === null ? 'A1 exit test' : `Unit ${unit} checkpoint`}</Text>
        <Text style={styles.introBody}>
          This checks listening, recall, grammar and reading. You need 80% overall and at least 60% in
          each skill to pass.
        </Text>
        <Pressable style={[primaryButton, styles.ctaButton]} onPress={begin} accessibilityLabel="Start the checkpoint">
          <Text style={styles.ctaText}>Start</Text>
          <Ionicons name="arrow-forward" size={20} color={c.onAccent} />
        </Pressable>
      </ScrollView>
    );
  }

  if (phase === 'result' && score) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
        <View style={styles.resultCard}>
          <Ionicons name={score.passed ? 'trophy' : 'refresh-circle'} size={48} color={score.passed ? c.primary : c.wrong} />
          <Text style={styles.resultTitle}>{score.passed ? 'You passed!' : 'Not yet — try again'}</Text>
          <Text style={styles.resultOverall}>{score.overallPct}% overall</Text>
          {(Object.keys(score.perSkillPct) as Skill[]).map((skill) => (
            <Text key={skill} style={styles.resultSkill}>
              {SKILL_LABEL[skill]}: {score.perSkillPct[skill]}%
            </Text>
          ))}
        </View>

        {!score.passed && score.missed.length > 0 && (
          <View style={styles.missedSection}>
            <Text style={t.sectionTitle}>Review these</Text>
            {score.missed.map((m, i) => {
              const found = cards.find((card) => card.refId === m.refId && card.skill === m.skill);
              return (
                <View key={`${m.refId}-${i}`} style={styles.missedRow}>
                  <Text style={styles.missedSkill}>{SKILL_LABEL[m.skill]}</Text>
                  <Text style={styles.missedAnswer}>{answerTextFor(found) ?? m.refId}</Text>
                </View>
              );
            })}
          </View>
        )}

        {score.passed ? (
          <Pressable style={[primaryButton, styles.ctaButton]} onPress={onDone} accessibilityLabel="Back to Home">
            <Text style={styles.ctaText}>Back to Home</Text>
          </Pressable>
        ) : (
          <View style={styles.resultActions}>
            <Pressable style={[primaryButton, styles.ctaButton]} onPress={() => startAttempt()} accessibilityLabel="Retry the checkpoint">
              <Text style={styles.ctaText}>Retry</Text>
            </Pressable>
            <Pressable onPress={onDone} style={styles.laterLink} accessibilityLabel="Back to Home">
              <Text style={styles.laterText}>Back to Home</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  }

  const card = cards[index];
  if (!card) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
      <Text style={styles.progressText}>
        {SKILL_LABEL[card.skill]} · {index + 1} of {cards.length}
      </Text>

      {(card.ui === 'choice' || card.ui === 'type') && card.dialogue && card.dialogue.length > 0 && (
        <View style={styles.dialogueBox}>
          {card.dialogue.map((line) => (
            <Text key={line.id} style={styles.dialogueLine}>
              <Text style={styles.dialogueSpeaker}>{line.speaker}: </Text>
              {line.setswana}
            </Text>
          ))}
        </View>
      )}

      {card.ui === 'listen-choice' && (
        <>
          <ListeningPrompt audioId={card.audioId} fallbackText={card.fallbackText} />
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
      {card.ui === 'choice' && (
        <>
          <Text style={styles.prompt}>{card.prompt}</Text>
          <ChoiceOptions options={card.options} selected={selected} answered={answered} correctAnswer={card.answer} onSelect={chooseOption} />
        </>
      )}
      {card.ui === 'type' && (
        <>
          <Text style={styles.prompt}>{card.question.prompt}</Text>
          <TypedAnswerInput value={typed} onChange={setTyped} onSubmit={submitTyped} answered={answered} />
        </>
      )}

      {answered && (
        <FeedbackPanel
          correct={correct}
          correctAnswer={
            card.ui === 'listen-choice' || card.ui === 'choice' ? card.answer : card.ui === 'recall-type' ? card.recall.answer : card.question.answer
          }
          note={card.note}
          onContinue={next}
        />
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
    introBody: { fontSize: 15, fontWeight: '600', color: c.text, marginTop: 12, lineHeight: 22 },
    ctaButton: { backgroundColor: c.accent, flexDirection: 'row', gap: 8, marginTop: 20 },
    ctaText: { fontSize: 17, fontWeight: '800', color: c.onAccent },
    progressText: { fontSize: 13, fontWeight: '800', color: c.muted, marginBottom: 12 },
    prompt: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 16 },
    dialogueBox: {
      backgroundColor: c.primarySoft,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },
    dialogueLine: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 4 },
    dialogueSpeaker: { fontWeight: '800' },
    resultCard: { alignItems: 'center', backgroundColor: c.card, borderRadius: 24, padding: 24, ...cardShadow(c, 'md') },
    resultTitle: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 10 },
    resultOverall: { fontSize: 17, fontWeight: '800', color: c.primaryDeep, marginTop: 10 },
    resultSkill: { fontSize: 14, fontWeight: '600', color: c.muted, marginTop: 2 },
    missedSection: { marginTop: 20 },
    missedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    missedSkill: { fontSize: 13, fontWeight: '700', color: c.muted },
    missedAnswer: { fontSize: 14, fontWeight: '700', color: c.text },
    resultActions: { marginTop: 8 },
    laterLink: { alignSelf: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' },
    laterText: { fontSize: 14, fontWeight: '700', color: c.muted },
  });
