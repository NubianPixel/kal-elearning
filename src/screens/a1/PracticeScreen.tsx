import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { cardShadow, makeTextStyles, useTheme, type ThemeColors } from '../../theme';
import { items, itemById, type Item } from '../../content';
import { introducedItemIds, recentMistakeItemIds } from '../../db/progress';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import PracticeQuiz from './PracticeQuiz';
import PracticeTyping from './PracticeTyping';

interface Props {
  db: SQLite.SQLiteDatabase;
}

type Mode = 'mistakes' | 'flashcards' | 'typing';
const MODES: Array<{ key: Mode; label: string }> = [
  { key: 'mistakes', label: 'Mistakes' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'typing', label: 'Typing' },
];

/**
 * Practice tab: three free-practice modes over introduced items only.
 * None of them ever call recordReview, change card states, count toward
 * reviewedToday/introducedToday, or mark the daily goal/streak (spec rule
 * — Practice is purely for extra reps, never scored progress).
 */
export default function PracticeScreen({ db }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const [mode, setMode] = useState<Mode>('mistakes');
  const [loading, setLoading] = useState(true);
  const [introduced, setIntroduced] = useState<Item[]>([]);
  const [mistakes, setMistakes] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [introducedIds, mistakeIds] = await Promise.all([introducedItemIds(db), recentMistakeItemIds(db)]);
      if (cancelled) return;
      setIntroduced(items.filter((i) => introducedIds.has(i.id)));
      setMistakes(mistakeIds.map((id) => itemById(id)).filter((i): i is Item => !!i));
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [db]);

  if (loading) {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (introduced.length === 0) {
    return (
      <View style={[styles.center, safeEdges]}>
        <Text style={styles.emptyTitle}>Nothing to practise yet</Text>
        <Text style={t.mutedText}>Start Unit 1 on Home.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, safeEdges]}>
      <View style={styles.segmentRow}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            style={[styles.segment, mode === m.key && styles.segmentActive]}
            onPress={() => setMode(m.key)}
            accessibilityLabel={`${m.label} practice`}
          >
            <Text style={[styles.segmentText, mode === m.key && styles.segmentTextActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {mode === 'mistakes' && (
          <PracticeQuiz
            items={mistakes}
            distractorPool={introduced}
            emptyTitle="No recent mistakes"
            emptyBody="Nice work — nothing to review here right now."
          />
        )}
        {mode === 'flashcards' && (
          <PracticeQuiz
            items={introduced}
            distractorPool={introduced}
            emptyTitle="Nothing introduced yet"
            emptyBody="Start Unit 1 on Home."
          />
        )}
        {mode === 'typing' && <PracticeTyping items={introduced} />}
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    body: { flex: 1 },
    center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center' },
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 12,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 6,
      ...cardShadow(c, 'sm'),
    },
    segment: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { fontSize: 13, fontWeight: '800', color: c.muted },
    segmentTextActive: { color: c.onPrimary },
  });
