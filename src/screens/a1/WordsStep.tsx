import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import { itemsForUnit, audioFor, imageFor, type Item } from '../../content';
import { introduceItems } from '../../db/progress';
import { playClip, useClipToggle } from '../../audio';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { loadPathData, checkAndMarkGoal } from './pathData';
import WordImage from '../../components/WordImage';
import CircleFrame from '../../components/CircleFrame';

interface Props {
  db: SQLite.SQLiteDatabase;
  unit: number;
  onDone: () => void;
}

/** Words step: introduce the next batch of un-introduced unit items (batch size = today's pacing). */
export default function WordsStep({ db, unit, onDone }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const [phase, setPhase] = useState<'loading' | 'showing' | 'rest'>('loading');
  const [batch, setBatch] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const data = await loadPathData(db);
      // Words is only ever opened for the learner's current unit (Home's
      // Continue router), so currentUnit's introduced set applies here.
      const introducedIds = data.path.currentUnit?.introducedItemIds ?? new Set<string>();
      const remaining = itemsForUnit(unit).filter((i) => !introducedIds.has(i.id));
      const n = data.path.newItemsAllowedToday;
      const nextBatch = remaining.slice(0, n);
      if (nextBatch.length === 0) {
        setPhase('rest');
        return;
      }
      setBatch(nextBatch);
      setIndex(0);
      setPhase('showing');
    })().catch(() => setPhase('rest'));
  }, [db, unit]);

  const item: Item | undefined = batch[index];
  const assetId = item ? audioFor(item.id) : undefined;
  // Called unconditionally (Rules of Hooks) even before an item exists.
  const clip = useClipToggle(assetId);

  async function finish() {
    await introduceItems(db, batch.map((i) => i.id));
    await checkAndMarkGoal(db);
    onDone();
  }

  if (phase === 'loading') {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (phase === 'rest') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.restContent, safeEdges]}>
        <Ionicons name="checkmark-circle" size={48} color={c.primary} />
        <Text style={styles.restTitle}>No new words right now</Text>
        <Text style={t.mutedText}>Come back after clearing today's reviews, or tomorrow for more.</Text>
        <Pressable style={[primaryButton, styles.doneButton]} onPress={onDone} accessibilityLabel="Back to Home">
          <Text style={styles.doneText}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!item) return null; // phase === 'showing' guarantees this in practice

  const isLast = index === batch.length - 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
      <Text style={styles.progressText}>
        {index + 1} of {batch.length}
      </Text>

      <View style={styles.card}>
        <CircleFrame size={120} backgroundColor={c.accentSoft}>
          <WordImage uri={imageFor(item.id) ?? null} iconSize={48} />
        </CircleFrame>

        <Text style={styles.setswana}>{item.setswana}</Text>
        <Text style={styles.english}>{item.english.join(' / ')}</Text>
        {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}

        <View style={styles.audioRow}>
          <Pressable
            style={[styles.audioButton, assetId === undefined && styles.audioButtonDisabled]}
            onPress={() => assetId !== undefined && clip.toggle()}
            disabled={assetId === undefined}
            accessibilityLabel={clip.playing ? 'Pause the sound' : 'Play the word'}
          >
            <Ionicons name={clip.playing ? 'pause' : 'volume-high'} size={22} color={c.onPrimary} />
            <Text style={styles.audioButtonText}>Play</Text>
          </Pressable>
          <Pressable
            style={[styles.slowButton, assetId === undefined && styles.audioButtonDisabled]}
            onPress={() => assetId !== undefined && playClip(assetId, undefined, 0.75)}
            disabled={assetId === undefined}
            accessibilityLabel="Play slowly"
          >
            <Text style={styles.slowButtonText}>0.75×</Text>
          </Pressable>
        </View>
        {assetId === undefined ? <Text style={styles.noAudio}>No recording yet</Text> : null}
        {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
      </View>

      <View style={styles.navRow}>
        <Pressable
          style={[styles.navButton, index === 0 && styles.navButtonDisabled]}
          onPress={() => index > 0 && setIndex(index - 1)}
          disabled={index === 0}
          accessibilityLabel="Previous word"
        >
          <Ionicons name="chevron-back" size={22} color={index === 0 ? c.muted : c.text} />
        </Pressable>
        <Pressable
          style={[primaryButton, styles.nextButton]}
          onPress={() => (isLast ? finish() : setIndex(index + 1))}
          accessibilityLabel={isLast ? 'Finish' : 'Next word'}
        >
          <Text style={styles.nextText}>{isLast ? 'Finish' : 'Next'}</Text>
          <Ionicons name={isLast ? 'checkmark' : 'chevron-forward'} size={20} color={c.onAccent} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    restContent: { padding: 20, alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: 8 },
    center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
    progressText: { fontSize: 13, fontWeight: '800', color: c.muted, marginBottom: 12 },
    card: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 26,
      padding: 24,
      ...cardShadow(c, 'md'),
    },
    setswana: { fontSize: 30, fontWeight: '800', color: c.text, marginTop: 16, textAlign: 'center' },
    english: { fontSize: 18, fontWeight: '700', color: c.primaryDeep, marginTop: 4, textAlign: 'center' },
    hint: { fontSize: 13, fontWeight: '600', color: c.muted, marginTop: 4, textAlign: 'center' },
    audioRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    audioButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primary,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 44,
    },
    slowButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
      borderRadius: 16,
      paddingHorizontal: 14,
      minHeight: 44,
      minWidth: 44,
    },
    audioButtonDisabled: { opacity: 0.4 },
    audioButtonText: { fontSize: 14, fontWeight: '800', color: c.onPrimary },
    slowButtonText: { fontSize: 13, fontWeight: '800', color: c.primaryDeep },
    noAudio: { marginTop: 8, fontSize: 12, fontWeight: '700', color: c.muted },
    note: { marginTop: 12, fontSize: 13, fontWeight: '600', color: c.muted, textAlign: 'center' },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
    navButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      ...cardShadow(c, 'sm'),
    },
    navButtonDisabled: { opacity: 0.4 },
    nextButton: { flex: 1, backgroundColor: c.accent, flexDirection: 'row', gap: 8, marginVertical: 0 },
    nextText: { fontSize: 17, fontWeight: '800', color: c.onAccent },
    restTitle: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 8, textAlign: 'center' },
    doneButton: { backgroundColor: c.primary, marginTop: 12 },
    doneText: { fontSize: 16, fontWeight: '800', color: c.onPrimary },
  });
