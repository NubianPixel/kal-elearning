import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, useTheme, type ThemeColors } from '../../theme';
import { items, units, audioFor, dialogueForUnit, type Item, type Unit } from '../../content';
import {
  introducedItemIds,
  passedUnits,
  type ProgressDb,
} from '../../db/progress';
import { unitStatus } from '../../core/path';
import { playClip, useClipToggle } from '../../audio';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import DialoguePlayer from '../../components/DialoguePlayer';

interface Props {
  db: ProgressDb;
}

type Segment = 'words' | 'stories';

/** Library tab: a searchable word browser and unlocked-unit story replays.
 *  Read-only — no SRS writes, no record-and-compare. */
export default function LibraryScreen({ db }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const [segment, setSegment] = useState<Segment>('words');
  const [loading, setLoading] = useState(true);
  const [wordItems, setWordItems] = useState<Item[]>([]);
  const [storyUnits, setStoryUnits] = useState<Unit[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [introducedIds, passed] = await Promise.all([introducedItemIds(db), passedUnits(db)]);
      if (cancelled) return;
      setWordItems(items.filter((i) => introducedIds.has(i.id)));
      setStoryUnits(units.filter((u) => unitStatus(u.unit, passed) !== 'locked').sort((a, b) => a.unit - b.unit));
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

  return (
    <View style={[styles.container, safeEdges]}>
      <View style={styles.segmentRow}>
        <Pressable
          style={[styles.segment, segment === 'words' && styles.segmentActive]}
          onPress={() => setSegment('words')}
          accessibilityLabel="Words"
        >
          <Text style={[styles.segmentText, segment === 'words' && styles.segmentTextActive]}>Words</Text>
        </Pressable>
        <Pressable
          style={[styles.segment, segment === 'stories' && styles.segmentActive]}
          onPress={() => setSegment('stories')}
          accessibilityLabel="Stories"
        >
          <Text style={[styles.segmentText, segment === 'stories' && styles.segmentTextActive]}>Stories</Text>
        </Pressable>
      </View>

      {segment === 'words' ? <WordsBrowser items={wordItems} /> : <StoriesBrowser storyUnits={storyUnits} />}
    </View>
  );
}

function WordsBrowser({ items: wordItems }: { items: Item[] }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return wordItems;
    return wordItems.filter(
      (i) => i.setswana.toLowerCase().includes(q) || i.english.some((en) => en.toLowerCase().includes(q)),
    );
  }, [wordItems, query]);

  if (wordItems.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nothing introduced yet</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.muted }}>Start Unit 1 on Home.</Text>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search Setswana or English"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search words"
      />
      <ScrollView contentContainerStyle={styles.listContent}>
        {filtered.map((item) => (
          <WordRow key={item.id} item={item} />
        ))}
        {filtered.length === 0 && <Text style={styles.emptyTitle}>No matches</Text>}
      </ScrollView>
    </View>
  );
}

function WordRow({ item }: { item: Item }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const assetId = audioFor(item.id);
  const clip = useClipToggle(assetId);

  return (
    <Pressable
      style={styles.wordRow}
      onPress={() => assetId !== undefined && clip.toggle()}
      disabled={assetId === undefined}
      accessibilityLabel={`${item.setswana}, ${clip.playing ? 'pause' : 'play'}`}
    >
      <View style={[styles.wordAudioButton, assetId === undefined && styles.wordAudioButtonDisabled]}>
        <Ionicons name={clip.playing ? 'pause' : 'volume-medium'} size={18} color={c.onPrimary} />
      </View>
      <View style={styles.wordTextWrap}>
        <Text style={styles.wordSt}>{item.setswana}</Text>
        <Text style={styles.wordEn}>{item.english.join(' / ')}</Text>
        {item.hint ? <Text style={styles.wordHint}>{item.hint}</Text> : null}
        {item.plural.length > 0 ? <Text style={styles.wordHint}>Plural: {item.plural.join(', ')}</Text> : null}
        {item.note ? <Text style={styles.wordNote}>{item.note}</Text> : null}
        {assetId === undefined ? <Text style={styles.noAudio}>No recording yet</Text> : null}
      </View>
      {assetId !== undefined && (
        <Pressable style={styles.slowButton} onPress={() => playClip(assetId, undefined, 0.75)} accessibilityLabel="Play slowly">
          <Text style={styles.slowButtonText}>0.75×</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function StoriesBrowser({ storyUnits }: { storyUnits: Unit[] }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [openUnit, setOpenUnit] = useState<number | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);

  if (openUnit != null) {
    const unit = storyUnits.find((u) => u.unit === openUnit);
    const lines = dialogueForUnit(openUnit);
    return (
      <ScrollView style={styles.body} contentContainerStyle={styles.listContent}>
        <Pressable style={styles.backRow} onPress={() => setOpenUnit(null)} accessibilityLabel="Back to stories list">
          <Ionicons name="chevron-back" size={20} color={c.primaryDeep} />
          <Text style={styles.backText}>Stories</Text>
        </Pressable>
        <Text style={styles.storyTitle}>
          Unit {openUnit} · {unit?.titleSetswana}
        </Text>
        <DialoguePlayer lines={lines} showEnglish={showEnglish} onToggleEnglish={setShowEnglish} />
      </ScrollView>
    );
  }

  if (storyUnits.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No stories unlocked yet</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.muted }}>Finish Unit 1's Use it step on Home.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.listContent}>
      {storyUnits.map((u) => (
        <Pressable key={u.unit} style={styles.storyRow} onPress={() => setOpenUnit(u.unit)} accessibilityLabel={`Open Unit ${u.unit} story`}>
          <Ionicons name="book-outline" size={20} color={c.primaryDeep} />
          <View style={styles.wordTextWrap}>
            <Text style={styles.wordSt}>
              Unit {u.unit} · {u.titleSetswana}
            </Text>
            <Text style={styles.wordEn}>{u.canDo}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    body: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center' },
    listContent: { padding: 20, paddingTop: 0 },
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
    search: {
      marginHorizontal: 20,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: c.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 44,
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
      backgroundColor: c.card,
    },
    wordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10,
      minHeight: 44,
      ...cardShadow(c, 'sm'),
    },
    wordAudioButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wordAudioButtonDisabled: { opacity: 0.4 },
    wordTextWrap: { flex: 1 },
    wordSt: { fontSize: 16, fontWeight: '800', color: c.text },
    wordEn: { fontSize: 13, fontWeight: '600', color: c.primaryDeep, marginTop: 1 },
    wordHint: { fontSize: 12, fontWeight: '600', color: c.muted, marginTop: 1 },
    wordNote: { fontSize: 12, fontWeight: '600', color: c.muted, marginTop: 2, fontStyle: 'italic' },
    noAudio: { fontSize: 11, fontWeight: '700', color: c.muted, marginTop: 2 },
    slowButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
      borderRadius: 12,
      paddingHorizontal: 10,
    },
    slowButtonText: { fontSize: 12, fontWeight: '800', color: c.primaryDeep },
    storyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      minHeight: 44,
      ...cardShadow(c, 'sm'),
    },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginBottom: 4 },
    backText: { fontSize: 15, fontWeight: '800', color: c.primaryDeep },
    storyTitle: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 12 },
  });
