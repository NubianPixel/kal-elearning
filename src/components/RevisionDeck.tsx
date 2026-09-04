import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { cardShadow, makeTextStyles, useTheme, type ThemeColors } from '../theme';
import { playClip, stopActiveClip } from '../audio';
import { listCategories, listVocabulary } from '../db/repositories';
import type { Category, Difficulty, VocabularyEntry } from '../core/types';
import WordImage from '../components/WordImage';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  onBack: () => void;
}

const DIFFICULTY_COLOR: Record<Difficulty, string> = { 1: '#4CAF50', 2: '#FF9800', 3: '#E53935' };

/**
 * Revision deck — browse vocabulary as full-screen cards you slide left
 * or right, with a category filter up top. Each card auto-plays its
 * pronunciation when it settles into focus; tap the speaker to replay.
 */
export default function RevisionDeck({ db, languageId, onBack }: Props) {
  const [entries, setEntries] = useState<VocabularyEntry[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<number | 'all'>('all');
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<VocabularyEntry> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);

  useEffect(() => {
    Promise.all([listVocabulary(db, languageId), listCategories(db, languageId)])
      .then(([v, cats]) => {
        setEntries(v);
        setCategories(cats);
      })
      .catch(() => setEntries([]));
  }, [db, languageId]);

  useEffect(() => () => stopActiveClip(), []);

  const visible = useMemo(
    () => (entries ?? []).filter((e) => filter === 'all' || e.categoryId === filter),
    [entries, filter],
  );

  const catById = useCallback(
    (id: number | null) => categories.find((cat) => cat.id === id) ?? null,
    [categories],
  );

  const countFor = useCallback(
    (catId: number | null) => (entries ?? []).filter((e) => e.categoryId === catId).length,
    [entries],
  );

  /** Play the audio for the entry that just settled into focus. */
  const playFor = useCallback((entry: VocabularyEntry | undefined) => {
    if (entry?.audioUri) playClip(entry.audioUri).catch(() => undefined);
  }, []);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    playFor(visible[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const onMomentumEnd = useCallback(
    (offsetX: number) => {
      if (visible.length === 0) return;
      const index = Math.round(offsetX / Math.max(1, width));
      const clamped = Math.min(Math.max(index, 0), visible.length - 1);
      playFor(visible[clamped]);
    },
    [visible, width, playFor],
  );

  if (entries === null) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={c.primaryDeep} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={t.titleText}>Revise words</Text>
          <Text style={styles.subtitle}>Slide left and right through your words</Text>
        </View>
      </View>

      {/* Category filter */}
      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            style={[styles.chip, filter === 'all' && styles.chipOn]}
            onPress={() => setFilter('all')}
          >
            <Text style={filter === 'all' ? styles.chipTextOn : styles.chipText}>
              All · {entries.length}
            </Text>
          </Pressable>
          {categories.map((cat) => {
            const on = filter === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setFilter(on ? 'all' : cat.id)}
              >
                {cat.icon ? (
                  <Ionicons
                    name={cat.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={14}
                    color={on ? c.onPrimary : c.primaryDeep}
                  />
                ) : null}
                <Text style={on ? styles.chipTextOn : styles.chipText}>
                  {cat.name} · {countFor(cat.id)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* The swipe deck */}
      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={44} color={c.muted} />
          <Text style={styles.emptyTitle}>No words here</Text>
          <Text style={styles.emptyHint}>Pick a different category.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(e) => String(e.id)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => onMomentumEnd(e.nativeEvent.contentOffset.x)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item, index }) => {
            const cat = catById(item.categoryId);
            return (
              <View style={[styles.page, { width }]}>
                <View style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.catPill}>
                      {cat?.icon ? (
                        <Ionicons
                          name={cat.icon as React.ComponentProps<typeof Ionicons>['name']}
                          size={14}
                          color={c.primaryDeep}
                        />
                      ) : null}
                      <Text style={styles.catPillText}>{cat ? cat.name : 'Uncategorised'}</Text>
                    </View>
                    <View style={styles.dotsRow}>
                      {([1, 2, 3] as Difficulty[]).map((d) => (
                        <View
                          key={d}
                          style={[
                            styles.dot,
                            {
                              backgroundColor:
                                d <= item.difficulty ? DIFFICULTY_COLOR[item.difficulty] : c.primarySoft,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.imageWrap}>
                    <WordImage uri={item.imageUri} style={styles.image} iconSize={60} />
                  </View>

                  <Text style={styles.word}>{item.targetText}</Text>
                  <Text style={styles.translation}>{item.translation}</Text>

                  <Pressable
                    style={styles.speaker}
                    onPress={() => {
                      if (item.audioUri) playClip(item.audioUri).catch(() => undefined);
                    }}
                    accessibilityLabel={`Hear ${item.targetText}`}
                  >
                    <Ionicons name="volume-high" size={22} color={c.onPrimary} />
                    <Text style={styles.speakerText}>{item.audioUri ? 'Listen' : 'No audio yet'}</Text>
                  </Pressable>
                </View>

                <Text style={styles.counter}>
                  {index + 1} of {visible.length}
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    subtitle: { fontSize: 13, color: c.muted, marginTop: 2 },

    filterWrap: { paddingVertical: 2 },
    chipsRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 6 },
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

    page: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 12,
    },
    card: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 28,
      padding: 20,
      alignItems: 'center',
      ...cardShadow(c, 'md'),
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
    },
    catPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.primarySoft,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    catPillText: { color: c.primaryDeep, fontWeight: '700', fontSize: 12 },
    dotsRow: { flexDirection: 'row', gap: 4 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    imageWrap: {
      marginTop: 26,
      width: 150,
      height: 150,
      borderRadius: 26,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    image: { width: 140, height: 140, borderRadius: 24 },
    word: {
      marginTop: 22,
      fontSize: 40,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
    },
    translation: {
      marginTop: 6,
      fontSize: 20,
      color: c.muted,
      textAlign: 'center',
    },
    speaker: {
      marginTop: 26,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.primary,
      borderRadius: 22,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    speakerText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },

    counter: {
      textAlign: 'center',
      color: c.muted,
      fontWeight: '600',
      fontSize: 13,
      marginTop: 10,
    },
    empty: { alignItems: 'center', marginTop: 48, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    emptyHint: { fontSize: 14, color: c.muted, textAlign: 'center' },
  });