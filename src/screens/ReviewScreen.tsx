import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type * as SQLite from 'expo-sqlite';
import { colors, childButton, bigText, titleText } from '../theme';
import { getReviewQueue, recordAnswer, type QueueItem } from '../db/repositories';
import { playClip } from '../audio';
import type { VocabularyEntry } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  onExit: () => void;
}

type Phase = 'loading' | 'card' | 'empty' | 'done';
type PraiseIcon = 'star' | 'thumbs-up' | 'happy' | 'trophy' | 'heart' | 'sunny';

interface Choice {
  translation: string;
  isCorrect: boolean;
}

const PRAISE: readonly PraiseIcon[] = ['star', 'thumbs-up', 'happy', 'trophy', 'heart', 'sunny'];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildChoices(entry: VocabularyEntry, pool: VocabularyEntry[]): Choice[] {
  const distractors = shuffle(
    pool.filter((e) => e.id !== entry.id && e.translation !== entry.translation),
  )
    .slice(0, 3)
    .map((e) => ({ translation: e.translation, isCorrect: false }));
  return shuffle([{ translation: entry.translation, isCorrect: true }, ...distractors]);
}

/**
 * Child review session. Audio-first: the pronunciation clip plays
 * automatically when a card appears. The child taps one of four big
 * English meaning buttons — no reading of the target language required.
 */
export default function ReviewScreen({ db, languageId, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [answered, setAnswered] = useState<'correct' | 'wrong' | null>(null);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  const [allEntries, setAllEntries] = useState<VocabularyEntry[]>([]);
  const cardShownAt = useRef<number>(Date.now());
  const [praise] = useState<PraiseIcon>(() => PRAISE[Math.floor(Math.random() * PRAISE.length)]);

  const load = useCallback(async () => {
    setPhase('loading');
    const q = await getReviewQueue(db, languageId);
    const entries = q.map((item) => item.entry);
    setQueue(q);
    setAllEntries(entries);
    if (q.length === 0) {
      setPhase('empty');
    } else {
      setChoices(buildChoices(q[0].entry, entries));
      setPhase('card');
      cardShownAt.current = Date.now();
      if (q[0].entry.audioUri) {
        playClip(q[0].entry.audioUri).catch(() => undefined);
      }
    }
  }, [db, languageId]);

  useEffect(() => {
    load().catch(() => setPhase('empty'));
  }, [load]);

  const current = queue[0];

  function choose(translation: string) {
    if (answered || !current) return;
    setPicked(choices.findIndex((c) => c.translation === translation));
    const correct = translation === current.entry.translation;
    setAnswered(correct ? 'correct' : 'wrong');
    setStats((s) => ({ total: s.total + 1, correct: s.correct + (correct ? 1 : 0) }));
  }

  async function next() {
    if (!current) return;
    const timeSpentMs = Date.now() - cardShownAt.current;
    const answer = answered === 'correct' ? 'good' : 'again';
    try {
      await recordAnswer(db, current.entry.id, answer, timeSpentMs);
    } catch {
      // The review flow must never be blocked by a persistence hiccup.
    }

    const rest = queue.slice(1);
    const nextQueue = answered === 'wrong' ? [...rest, current] : rest; // failed cards re-queue in-session
    setQueue(nextQueue);
    setAnswered(null);
    setPicked(null);

    if (nextQueue.length === 0) {
      setPhase('done');
    } else {
      setChoices(buildChoices(nextQueue[0].entry, allEntries));
      cardShownAt.current = Date.now();
      if (nextQueue[0].entry.audioUri) {
        playClip(nextQueue[0].entry.audioUri).catch(() => undefined);
      }
    }
  }

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (phase === 'empty') {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={72} color={colors.primary} />
        <Text style={titleText}>All done for now!</Text>
        <Pressable style={[childButton, styles.nextButton]} onPress={onExit}>
          <Ionicons name="home" size={26} color="#fff" />
          <Text style={styles.nextText}>Home</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={styles.center}>
        <Ionicons name="ribbon" size={80} color={colors.accent} />
        <Text style={titleText}>Great job!</Text>
        <Text style={styles.doneStats}>
          {stats.correct} of {stats.total} correct!
        </Text>
        <Pressable style={[childButton, styles.nextButton]} onPress={onExit}>
          <Ionicons name="home" size={26} color="#fff" />
          <Text style={styles.nextText}>Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.counterRow}>
        <Ionicons name={answered ? praise : 'ear'} size={20} color={colors.muted} />
        <Text style={styles.counter}>Word {stats.total + 1}</Text>
      </View>

      <Pressable
        style={styles.audioCard}
        onPress={() =>
          current?.entry.audioUri && playClip(current.entry.audioUri).catch(() => undefined)
        }
      >
        <Ionicons name="volume-high" size={72} color={colors.accent} />
        <Text style={styles.targetWord}>{current?.entry.targetText}</Text>
        <Text style={styles.tapHint}>Tap to hear it!</Text>
      </Pressable>

      <View style={styles.choicesGrid}>
        {choices.map((choice, i) => {
          const bgColor =
            answered === null
              ? colors.card
              : choice.isCorrect
                ? colors.correct
                : i === picked
                  ? colors.wrong
                  : colors.card;
          return (
            <Pressable
              key={choice.translation + i}
              style={[styles.choiceButton, { backgroundColor: bgColor }]}
              onPress={() => choose(choice.translation)}
            >
              <Text style={styles.choiceText}>{choice.translation}</Text>
            </Pressable>
          );
        })}
      </View>

      {answered !== null && (
        <Pressable style={[childButton, styles.nextButton]} onPress={next}>
          {answered === 'correct' && (
            <Ionicons name={praise} size={26} color="#fff" />
          )}
          <Text style={styles.nextText}>
            {answered === 'correct' ? 'Yes! Next' : 'Almost! Try the next one'}
          </Text>
          <Ionicons name="arrow-forward" size={26} color="#fff" />
        </Pressable>
      )}

      <Pressable onPress={onExit} style={styles.exitButton} accessibilityLabel="Exit review">
        <Ionicons name="close-circle" size={36} color={colors.muted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 48 },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  counter: { fontSize: 18, fontWeight: '700', color: colors.muted },
  audioCard: {
    backgroundColor: colors.card,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.accent,
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 24,
  },
  targetWord: { ...titleText, fontSize: 44, marginTop: 8 },
  tapHint: { fontSize: 16, color: colors.muted, marginTop: 4 },
  choicesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  choiceButton: {
    width: '48.5%',
    minHeight: 96,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
  },
  choiceText: { ...bigText, textAlign: 'center' },
  nextButton: {
    backgroundColor: colors.primary,
    paddingVertical: 24,
    flexDirection: 'row',
    gap: 10,
  },
  nextText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  doneStats: { ...bigText, marginVertical: 16 },
  exitButton: { alignSelf: 'center', marginTop: 8, padding: 16 },
});

