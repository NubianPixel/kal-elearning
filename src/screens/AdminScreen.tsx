import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type * as SQLite from 'expo-sqlite';
import WordImage from '../components/WordImage';
import { childButton, makeTextStyles, useTheme, type ThemeColors } from '../theme';
import {
  createCategory,
  createVocabulary,
  deleteVocabulary,
  listCategories,
  listVocabulary,
  updateVocabulary,
  type VocabularyInput,
} from '../db/repositories';
import {
  getRecordPermission,
  playClip,
  requestMicPermission,
  startRecording,
  stopActiveClip,
  type ActiveRecording,
} from '../audio';
import type { Category, Difficulty, VocabularyEntry } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  languageName: string;
  onExit: () => void;
}

/** Starter illustrations offered for pre-readers. */
const ICON_CHOICES = [
  'paw-outline',
  'water-outline',
  'book-outline',
  'restaurant-outline',
  'hand-left-outline',
  'heart-outline',
  'happy-outline',
  'sad-outline',
  'woman-outline',
  'man-outline',
  'people-outline',
  'home-outline',
  'car-sport-outline',
  'airplane-outline',
  'basketball-outline',
  'leaf-outline',
  'moon-outline',
  'sunny-outline',
  'musical-notes-outline',
  'star-outline',
] as const;

const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const DIFFICULTY_COLOR: Record<Difficulty, string> = { 1: '#4CAF50', 2: '#FF9800', 3: '#E53935' };

function emptyForm(): VocabularyInput & { id?: number } {
  return {
    id: undefined,
    languageId: 0,
    categoryId: null,
    targetText: '',
    translation: '',
    notes: null,
    difficulty: 1,
    audioUri: null,
    imageUri: null,
  };
}

/**
 * Parent/admin screen — content library for one language.
 *
 * Two pages:
 *  - "Words" library: search + category filters, entries grouped under
 *    category headers, floating add button.
 *  - Add/Edit form: its own focused page with labeled sections, so the
 *    form never shoves the list around.
 */
export default function AdminScreen({ db, languageId, languageName, onExit }: Props) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<'list' | 'form'>('list');
  const [form, setForm] = useState<(VocabularyInput & { id?: number }) | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<number | 'all'>('all');
  const [newCategory, setNewCategory] = useState('');
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(
    () => ({ ...makeStyles(c), ...formStyles(c) }) as ReturnType<typeof makeStyles> &
      ReturnType<typeof formStyles>,
    [c],
  );
  const t = useMemo(() => makeTextStyles(c), [c]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [v, cats] = await Promise.all([
      listVocabulary(db, languageId),
      listCategories(db, languageId),
    ]);
    setEntries(v);
    setCategories(cats);
    setLoading(false);
  }, [db, languageId]);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  useEffect(() => stopActiveClip, []);

  /* ---- Navigation between the two pages ---- */

  function startAdd() {
    setForm({ ...emptyForm(), languageId });
    setPage('form');
  }

  function startEdit(entry: VocabularyEntry) {
    setForm({
      id: entry.id,
      languageId: entry.languageId,
      categoryId: entry.categoryId,
      targetText: entry.targetText,
      translation: entry.translation,
      notes: entry.notes,
      difficulty: entry.difficulty,
      audioUri: entry.audioUri,
      imageUri: entry.imageUri,
    });
    setPage('form');
  }

  function closeForm() {
    if (recording) {
      recording.stop().catch(() => undefined);
      setRecording(null);
    }
    setForm(null);
    setPage('list');
  }

  /* ---- Data actions ---- */

  async function pickImage() {
    const granted = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted.granted) {
      Alert.alert('Photos needed', 'Allow photo access to add pictures to words.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setForm((f) => (f ? { ...f, imageUri: result.assets[0].uri } : f));
    }
  }

  async function toggleRecord() {
    if (!form) return;
    try {
      if (recording) {
        const uri = await recording.stop();
        setRecording(null);
        if (uri) setForm((f) => (f ? { ...f, audioUri: uri } : f));
      } else {
        await getRecordPermission();
        const granted = await requestMicPermission();
        if (!granted) {
          Alert.alert('Microphone needed', 'Allow microphone access to record pronunciations.');
          return;
        }
        setRecording(await startRecording());
      }
    } catch {
      setRecording(null);
      Alert.alert('Recording error', 'Could not record audio. Please try again.');
    }
  }

  async function save() {
    if (!form || !form.targetText.trim() || !form.translation.trim()) {
      Alert.alert('Missing words', 'Please fill in both the word and its translation.');
      return;
    }
    setSaving(true);
    try {
      const input: VocabularyInput = {
        languageId: form.languageId || languageId,
        categoryId: form.categoryId,
        targetText: form.targetText,
        translation: form.translation,
        notes: form.notes,
        difficulty: form.difficulty,
        audioUri: form.audioUri,
        imageUri: form.imageUri,
      };
      if (form.id) {
        await updateVocabulary(db, form.id, input);
      } else {
        await createVocabulary(db, input);
      }
      setForm(null);
      setPage('list');
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const cat = await createCategory(db, languageId, name, null);
    setNewCategory('');
    setForm((f) => (f ? { ...f, categoryId: cat.id } : f));
    await refresh();
  }

  function removeEntry(entry: VocabularyEntry) {
    Alert.alert('Delete word?', `Remove "${entry.targetText}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteVocabulary(db, entry.id)
            .then(refresh)
            .catch(() => undefined);
        },
      },
    ]);
  }

  /* ---- Derived: search filter + category grouping ---- */

  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (filterCat === 'all' || e.categoryId === filterCat) &&
        (!q ||
          e.targetText.toLowerCase().includes(q) ||
          e.translation.toLowerCase().includes(q)),
    );
  }, [entries, search, filterCat]);

  /** Entries grouped under their category, "Uncategorised" last. */
  const groups = useMemo(() => {
    const out: { cat: Category | null; items: VocabularyEntry[] }[] = [];
    for (const cat of categories) {
      const items = visibleEntries.filter((e) => e.categoryId === cat.id);
      if (items.length > 0) out.push({ cat, items });
    }
    const loose = visibleEntries.filter(
      (e) => e.categoryId === null || !categories.some((cat) => cat.id === e.categoryId),
    );
    if (loose.length > 0) out.push({ cat: null, items: loose });
    return out;
  }, [visibleEntries, categories]);

  const countFor = useCallback(
    (catId: number | null) => entries.filter((e) => e.categoryId === catId).length,
    [entries],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  /* ==================== PAGE: ADD / EDIT FORM ==================== */

  if (page === 'form' && form) {
    const valid = form.targetText.trim().length > 0 && form.translation.trim().length > 0;
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable onPress={closeForm} hitSlop={12} accessibilityLabel="Back to word list">
              <Ionicons name="chevron-back" size={28} color={c.primaryDeep} />
            </Pressable>
            <Text style={t.titleText}>{form.id ? 'Edit word' : 'New word'}</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>The word</Text>
            <Text style={styles.fieldLabel}>{languageName}</Text>
            <TextInput
              style={styles.input}
              value={form.targetText}
              onChangeText={(text) => setForm({ ...form, targetText: text })}
              placeholder="e.g. Dumela"
              placeholderTextColor={c.muted}
            />
            <Text style={styles.fieldLabel}>English translation</Text>
            <TextInput
              style={styles.input}
              value={form.translation}
              onChangeText={(text) => setForm({ ...form, translation: text })}
              placeholder="e.g. Hello"
              placeholderTextColor={c.muted}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Category</Text>
            <View style={styles.chipsRow}>
              {categories.map((cat) => {
                const on = form.categoryId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setForm({ ...form, categoryId: on ? null : cat.id })}
                  >
                    {cat.icon ? (
                      <Ionicons
                        name={cat.icon as React.ComponentProps<typeof Ionicons>['name']}
                        size={16}
                        color={on ? c.onPrimary : c.text}
                      />
                    ) : null}
                    <Text style={on ? styles.chipTextOn : styles.chipText}>{cat.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.addCategoryRow}>
              <TextInput
                style={[styles.input, styles.addCategoryInput]}
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="New category name"
                placeholderTextColor={c.muted}
                onSubmitEditing={addCategory}
              />
              <Pressable
                style={[styles.chip, styles.chipWithIcon]}
                onPress={addCategory}
                accessibilityLabel="Create category"
              >
                <Ionicons name="add" size={16} color={c.text} />
                <Text style={styles.chipText}>Add</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Difficulty</Text>
            <View style={styles.segmentRow}>
              {([1, 2, 3] as Difficulty[]).map((d) => (
                <Pressable
                  key={d}
                  style={[styles.segment, form.difficulty === d && styles.segmentOn]}
                  onPress={() => setForm({ ...form, difficulty: d })}
                >
                  <Text style={form.difficulty === d ? styles.segmentTextOn : styles.segmentText}>
                    {DIFFICULTY_LABEL[d]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Pronunciation</Text>
            <View style={styles.chipsRow}>
              <Pressable
                style={[styles.chip, styles.recordChip, recording && styles.recordChipOn]}
                onPress={toggleRecord}
              >
                <Ionicons
                  name={recording ? 'stop' : 'mic'}
                  size={16}
                  color={recording ? c.onPrimary : c.primaryDeep}
                />
                <Text style={recording ? styles.chipTextOn : styles.recordChipText}>
                  {recording ? 'Stop recording' : 'Record audio'}
                </Text>
              </Pressable>
              {form.audioUri && !recording && (
                <>
                  <Pressable
                    style={[styles.chip, styles.chipWithIcon]}
                    onPress={() => playClip(form.audioUri!, () => undefined).catch(() => undefined)}
                  >
                    <Ionicons name="play" size={16} color={c.text} />
                    <Text style={styles.chipText}>Preview</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, styles.chipWithIcon]}
                    onPress={() => setForm({ ...form, audioUri: null })}
                  >
                    <Ionicons name="trash-outline" size={16} color={c.danger} />
                    <Text style={styles.chipText}>Remove</Text>
                  </Pressable>
                </>
              )}
            </View>
            {!form.audioUri && !recording && (
              <Text style={styles.hint}>
                Optional — but your voice helps a 7-year-old learn fastest.
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Picture</Text>
            <View style={styles.imageRow}>
              {form.imageUri ? (
                <WordImage uri={form.imageUri} style={styles.imageThumb} iconSize={26} />
              ) : (
                <View style={[styles.imageThumb, styles.imageThumbEmpty]}>
                  <Ionicons name="image-outline" size={26} color={c.muted} />
                </View>
              )}
              <View style={styles.imageButtons}>
                <Pressable style={[styles.chip, styles.chipWithIcon]} onPress={pickImage}>
                  <Ionicons name="images-outline" size={16} color={c.text} />
                  <Text style={styles.chipText}>{form.imageUri ? 'Change' : 'Choose picture'}</Text>
                </Pressable>
                {form.imageUri && !form.imageUri.startsWith('icon:') ? (
                  <Pressable
                    style={[styles.chip, styles.chipWithIcon]}
                    onPress={() => setForm({ ...form, imageUri: null })}
                  >
                    <Ionicons name="trash-outline" size={16} color={c.danger} />
                    <Text style={styles.chipText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <Text style={styles.hint}>…or pick a starter illustration:</Text>
            <View style={styles.iconPicker}>
              {ICON_CHOICES.map((name) => {
                const selected = form.imageUri === `icon:${name}`;
                return (
                  <Pressable
                    key={name}
                    style={[styles.iconChip, selected && styles.iconChipOn]}
                    onPress={() => setForm({ ...form, imageUri: selected ? null : `icon:${name}` })}
                    accessibilityLabel={`Illustration ${name}`}
                  >
                    <Ionicons
                      name={name as React.ComponentProps<typeof Ionicons>['name']}
                      size={20}
                      color={selected ? c.onPrimary : c.text}
                    />
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Words with pictures unlock tap-the-picture quizzes — great for pre-readers.
            </Text>
          </View>

          <Pressable
            style={[childButton, styles.saveButton, (!valid || saving) && styles.disabled]}
            onPress={save}
            disabled={saving || !valid}
          >
            <Ionicons name="save-outline" size={22} color={c.onPrimary} />
            <Text style={styles.actionText}>{saving ? 'Saving…' : 'Save word'}</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={closeForm}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  /* ==================== PAGE: WORDS LIBRARY ==================== */

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={onExit} hitSlop={12} accessibilityLabel="Close word library">
            <Ionicons name="chevron-back" size={28} color={c.primaryDeep} />
          </Pressable>
          <Text style={t.titleText}>{languageName} words</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{entries.length}</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search words or translations…"
            placeholderTextColor={c.muted}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            style={[styles.filterChip, filterCat === 'all' && styles.filterChipOn]}
            onPress={() => setFilterCat('all')}
          >
            <Text style={filterCat === 'all' ? styles.filterChipTextOn : styles.filterChipText}>
              All · {entries.length}
            </Text>
          </Pressable>
          {categories.map((cat) => {
            const on = filterCat === cat.id;
            const n = countFor(cat.id);
            return (
              <Pressable
                key={cat.id}
                style={[styles.filterChip, on && styles.filterChipOn]}
                onPress={() => setFilterCat(on ? 'all' : cat.id)}
              >
                {cat.icon ? (
                  <Ionicons
                    name={cat.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={14}
                    color={on ? c.onPrimary : c.primaryDeep}
                  />
                ) : null}
                <Text style={on ? styles.filterChipTextOn : styles.filterChipText}>
                  {cat.name} · {n}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {groups.map(({ cat, items }) => (
          <View key={cat ? `cat-${cat.id}` : 'loose'} style={styles.group}>
            <View style={styles.groupHeader}>
              <Ionicons
                name={(cat?.icon ?? 'folder-outline') as React.ComponentProps<typeof Ionicons>['name']}
                size={18}
                color={c.primaryDeep}
              />
              <Text style={styles.groupTitle}>{cat ? cat.name : 'Uncategorised'}</Text>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{items.length}</Text>
              </View>
            </View>
            <View style={styles.groupCard}>
              {items.map((entry, idx) => (
                <Pressable
                  key={entry.id}
                  style={[styles.entryRow, idx > 0 && styles.entryDivider]}
                  onPress={() => startEdit(entry)}
                >
                  <View style={styles.entryText}>
                    <Text style={styles.entryTarget}>{entry.targetText}</Text>
                    <Text style={styles.entryTranslation}>{entry.translation}</Text>
                    <View style={styles.badgeRow}>
                      <View style={styles.dotsRow}>
                        {([1, 2, 3] as Difficulty[]).map((d) => (
                          <View
                            key={d}
                            style={[
                              styles.dot,
                              {
                                backgroundColor:
                                  d <= entry.difficulty
                                    ? DIFFICULTY_COLOR[entry.difficulty]
                                    : c.primarySoft,
                              },
                            ]}
                          />
                        ))}
                      </View>
                      {entry.audioUri ? (
                        <Ionicons name="volume-high" size={14} color={c.primary} />
                      ) : null}
                      {entry.imageUri ? <Ionicons name="image" size={14} color={c.primary} /> : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => startEdit(entry)}
                    hitSlop={8}
                    style={styles.entryAction}
                    accessibilityLabel={`Edit ${entry.targetText}`}
                  >
                    <Ionicons name="create-outline" size={22} color={c.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => removeEntry(entry)}
                    hitSlop={8}
                    style={styles.entryAction}
                    accessibilityLabel={`Delete ${entry.targetText}`}
                  >
                    <Ionicons name="trash-outline" size={22} color={c.danger} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {entries.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="albums-outline" size={44} color={c.muted} />
            <Text style={styles.emptyTitle}>No words yet</Text>
            <Text style={styles.emptyHint}>Tap the + button to add your first word.</Text>
          </View>
        )}
        {entries.length > 0 && visibleEntries.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={44} color={c.muted} />
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyHint}>Try a different search or category filter.</Text>
          </View>
        )}
      </ScrollView>

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={startAdd}
        accessibilityLabel="Add a word"
      >
        <Ionicons name="add" size={32} color={c.onPrimary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 48 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    /* Header */
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    countPill: {
      backgroundColor: c.primarySoft,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 3,
      marginLeft: 'auto',
    },
    countPillText: { color: c.primaryDeep, fontWeight: '800', fontSize: 14 },

    /* Search */
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.primarySoft,
      marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 16, color: c.text, padding: 0 },

    /* Category filter chips */
    filterRow: { gap: 8, paddingVertical: 4, marginBottom: 4 },
    filterChip: {
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
    filterChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    filterChipText: { color: c.text, fontWeight: '600', fontSize: 13 },
    filterChipTextOn: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },

    /* Groups */
    group: { marginTop: 16 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    groupTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    groupCount: {
      backgroundColor: c.primarySoft,
      borderRadius: 10,
      minWidth: 22,
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    groupCountText: { color: c.primaryDeep, fontSize: 12, fontWeight: '700' },
    groupCard: { backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' },

    /* Entry rows */
    entryRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 4 },
    entryDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.primarySoft },
    entryText: { flex: 1 },
    entryTarget: { fontSize: 17, fontWeight: '700', color: c.text },
    entryTranslation: { fontSize: 13, color: c.muted, marginTop: 1 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    dotsRow: { flexDirection: 'row', gap: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    entryAction: { paddingHorizontal: 6 },

    /* Empty states */
    emptyState: { alignItems: 'center', marginTop: 48, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    emptyHint: { fontSize: 14, color: c.muted, textAlign: 'center' },

    /* FAB */
    fab: {
      position: 'absolute',
      right: 24,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 5,
      elevation: 6,
    },
  });

const formStyles = (c: ThemeColors) =>
  StyleSheet.create({
    /* Form page */
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    cardLabel: {
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: c.primaryDeep,
      marginBottom: 10,
    },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.muted, marginTop: 8, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: c.primarySoft,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.background,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 2,
      borderColor: c.primarySoft,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: c.background,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipWithIcon: { alignSelf: 'flex-start' },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { color: c.text, fontWeight: '600' },
    chipTextOn: { color: c.onPrimary, fontWeight: '600' },
    recordChip: { borderColor: c.primary },
    recordChipOn: { backgroundColor: c.danger, borderColor: c.danger },
    recordChipText: { color: c.primaryDeep, fontWeight: '700' },
    addCategoryRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
    addCategoryInput: { flex: 1 },
    segmentRow: { flexDirection: 'row', backgroundColor: c.background, borderRadius: 12, padding: 3, gap: 3 },
    segment: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    segmentOn: { backgroundColor: c.primary },
    segmentText: { color: c.muted, fontWeight: '600' },
    segmentTextOn: { color: c.onPrimary, fontWeight: '800' },
    imageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    imageThumb: { width: 80, height: 60, borderRadius: 12, backgroundColor: c.primarySoft },
    imageThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
    imageButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 },
    iconPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    iconChip: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: c.primarySoft,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    hint: { color: c.muted, marginTop: 8, fontSize: 13 },
    saveButton: {
      backgroundColor: c.primary,
      paddingVertical: 18,
      flexDirection: 'row',
      gap: 10,
    },
    disabled: { opacity: 0.5 },
    actionText: { fontSize: 20, fontWeight: '800', color: c.onPrimary },
    cancelButton: { backgroundColor: 'transparent', paddingVertical: 12 },
    cancelText: { color: c.muted, fontWeight: '700', textAlign: 'center' },
  });








