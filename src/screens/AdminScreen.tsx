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
import {
  childButton,
  makeTextStyles,
  useTheme,
  type ThemeColors,
} from '../theme';
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
  getAudioFileInfo,
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

/** Empty form used for both "add" and "edit". */
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
 * Parent/admin screen: full CRUD for vocabulary entries plus one-tap
 * recording of pronunciation clips, and the app appearance picker.
 * Scoped strictly to content, progress and settings management.
 */
export default function AdminScreen({ db, languageId, languageName, onExit }: Props) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<(VocabularyInput & { id?: number }) | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [saving, setSaving] = useState(false);
  const [diag, setDiag] = useState<string[]>([]);
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
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

  function startAdd() {
    setForm({ ...emptyForm(), languageId });
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
  }

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
    try {
      if (recording) {
        const uri = await recording.stop();
        setRecording(null);
        setDiag((d) => [`Saved audio URI: ${uri ?? 'null'}`, ...d].slice(0, 8));
        if (uri) {
          setForm((f) => (f ? { ...f, audioUri: uri } : f));
          const info = getAudioFileInfo(uri);
          setDiag((d) => [
            `File on disk: ${info.exists} — size ${info.size ?? '?'} bytes`,
            ...d,
          ].slice(0, 8));
        }
      } else {
        const perm = await getRecordPermission();
        setDiag((d) => [`Record permission: ${perm.status}${perm.granted ? ' (granted)' : ''}`, ...d].slice(0, 8));
        const granted = await requestMicPermission();
        if (!granted) {
          Alert.alert('Microphone needed', 'Allow microphone access to record pronunciations.');
          return;
        }
        setRecording(await startRecording());
        setDiag((d) => ['Recording started — speak, then stop.', ...d].slice(0, 8));
      }
    } catch (e) {
      setRecording(null);
      setDiag((d) => [`Recording error: ${String(e)}`, ...d].slice(0, 8));
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
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    await createCategory(db, languageId, name, null);
    setNewCategory('');
    await refresh();
  }

  async function removeEntry(entry: VocabularyEntry) {
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

  const categoryName = (id: number | null) =>
    categories.find((cat) => cat.id === id)?.name ?? 'Uncategorised';

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={t.titleText}>{languageName} — Admin</Text>
        <Pressable onPress={onExit} hitSlop={12} accessibilityLabel="Close admin">
          <Ionicons name="close-circle" size={30} color={c.muted} />
        </Pressable>
      </View>

      <Pressable style={[childButton, styles.primaryAction]} onPress={startAdd}>
        <Ionicons name="add-circle" size={24} color={c.onPrimary} />
        <Text style={styles.actionText}>Add a word</Text>
      </Pressable>

      {form && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{form.id ? 'Edit word' : 'New word'}</Text>

          <Text style={styles.label}>Word ({languageName})</Text>
          <TextInput
            style={styles.input}
            value={form.targetText}
            onChangeText={(text) => setForm({ ...form, targetText: text })}
            placeholder="e.g. Dumela"
            placeholderTextColor={c.muted}
          />

          <Text style={styles.label}>Translation (English)</Text>
          <TextInput
            style={styles.input}
            value={form.translation}
            onChangeText={(text) => setForm({ ...form, translation: text })}
            placeholder="e.g. Hello"
            placeholderTextColor={c.muted}
          />


          <Text style={styles.label}>Category</Text>
          <View style={styles.chipsRow}>
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.chip, form.categoryId === cat.id && styles.chipOn]}
                onPress={() => setForm({ ...form, categoryId: cat.id })}
              >
                {cat.icon ? (
                  <Ionicons
                    name={cat.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={16}
                    color={form.categoryId === cat.id ? c.onPrimary : c.text}
                  />
                ) : null}
                <Text style={form.categoryId === cat.id ? styles.chipTextOn : styles.chipText}>
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.addCategoryRow}>
            <TextInput
              style={[styles.input, styles.addCategoryInput]}
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="New category name"
              placeholderTextColor={c.muted}
            />
            <Pressable style={[styles.chip, styles.chipWithIcon]} onPress={addCategory}>
              <Ionicons name="add" size={16} color={c.text} />
              <Text style={styles.chipText}>Add</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Difficulty</Text>
          <View style={styles.chipsRow}>
            {([1, 2, 3] as Difficulty[]).map((d) => (
              <Pressable
                key={d}
                style={[styles.chip, form.difficulty === d && styles.chipOn]}
                onPress={() => setForm({ ...form, difficulty: d })}
              >
                <Text style={form.difficulty === d ? styles.chipTextOn : styles.chipText}>
                  {d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Pronunciation audio</Text>
          <View style={styles.chipsRow}>
            <Pressable style={[styles.chip, recording && styles.chipOn]} onPress={toggleRecord}>
              <Ionicons
                name={recording ? 'stop-circle' : 'mic'}
                size={16}
                color={recording ? c.onPrimary : c.text}
              />
              <Text style={recording ? styles.chipTextOn : styles.chipText}>
                {recording ? 'Stop recording' : 'Record'}
              </Text>
            </Pressable>
            {form.audioUri && !recording && (
              <>
                <Pressable
                  style={[styles.chip, styles.chipWithIcon]}
                  onPress={() =>
                    playClip(form.audioUri!, (e) =>
                      setDiag((d) => [`Playback: ${e.kind} — ${e.message}`, ...d].slice(0, 8)),
                    ).catch(() => undefined)
                  }
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
            <Text style={styles.hint}>Optional — but audio helps a 7-year-old learn fastest.</Text>
          )}

          {diag.length > 0 && (
            <View style={styles.diagBox}>
              {diag.map((line, i) => (
                <Text key={i} style={styles.diagLine}>
                  {line}
                </Text>
              ))}
            </View>
          )}


          <Text style={styles.label}>Picture</Text>
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
              {form.imageUri ? (
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
                  onPress={() =>
                    setForm({ ...form, imageUri: selected ? null : `icon:${name}` })
                  }
                  accessibilityLabel={`Illustration ${name}`}
                >
                  <Ionicons name={name as React.ComponentProps<typeof Ionicons>['name']} size={20} color={selected ? c.onPrimary : c.text} />
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Words with pictures unlock tap-the-picture quizzes — great for pre-readers.
          </Text>

          <View style={styles.formButtons}>
            <Pressable
              style={[childButton, styles.saveButton, (!form.targetText || !form.translation) && styles.disabled]}
              onPress={save}
              disabled={saving}
            >
              <Ionicons name="save-outline" size={22} color={c.onPrimary} />
              <Text style={styles.actionText}>{saving ? 'Saving…' : 'Save word'}</Text>
            </Pressable>
            <Pressable style={[childButton, styles.cancelButton]} onPress={() => setForm(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}


      <Text style={styles.listTitle}>Words ({entries.length})</Text>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.entryRow}>
          <View style={styles.entryText}>
            <Text style={styles.entryTarget}>{entry.targetText}</Text>
            <Text style={styles.entryTranslation}>
              {categoryName(entry.categoryId)} · {entry.translation}
              {entry.audioUri ? ' · audio' : ''}
              {entry.imageUri ? ' · picture' : ''}
            </Text>
          </View>
          <Pressable onPress={() => startEdit(entry)} hitSlop={8} accessibilityLabel="Edit word">
            <Ionicons name="create-outline" size={22} color={c.primary} />
          </Pressable>
          <Pressable
            onPress={() => removeEntry(entry)}
            hitSlop={8}
            style={styles.entryDelete}
            accessibilityLabel="Delete word"
          >
            <Ionicons name="trash-outline" size={22} color={c.danger} />
          </Pressable>
        </View>
      ))}
      {entries.length === 0 && (
        <Text style={styles.hint}>No words yet — add the first one above.</Text>
      )}
    </ScrollView>
  );
}


const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 48 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    primaryAction: {
      backgroundColor: c.primary,
      paddingVertical: 20,
      flexDirection: 'row',
      gap: 10,
    },
    actionText: { fontSize: 20, fontWeight: '800', color: c.onPrimary },
    form: { backgroundColor: c.card, borderRadius: 16, padding: 16, marginTop: 16 },
    formTitle: { ...makeTextStyles(c).titleText, fontSize: 22, marginBottom: 8 },
    label: { fontWeight: '700', color: c.text, marginTop: 12, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: c.muted,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.card,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 2,
      borderColor: c.primary,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: c.card,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipWithIcon: { alignSelf: 'flex-start' },
    chipOn: { backgroundColor: c.primary },
    chipText: { color: c.text, fontWeight: '600' },
    chipTextOn: { color: c.onPrimary, fontWeight: '600' },
    addCategoryRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
    addCategoryInput: { flex: 1 },
    imageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    imageThumb: {
      width: 80,
      height: 60,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
    },
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
    hint: { color: c.muted, marginTop: 6, fontSize: 13 },
    diagBox: {
      backgroundColor: c.accentSoft,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.primary,
      padding: 8,
      marginTop: 8,
    },
    diagLine: { fontSize: 11, color: c.primaryDeep, fontFamily: 'monospace', marginVertical: 1 },
    formButtons: { marginTop: 16 },
    saveButton: {
      backgroundColor: c.primary,
      paddingVertical: 18,
      flexDirection: 'row',
      gap: 10,
    },
    disabled: { opacity: 0.5 },
    cancelButton: { backgroundColor: 'transparent', paddingVertical: 8 },
    cancelText: { color: c.muted, fontWeight: '700', textAlign: 'center' },
    listTitle: { ...makeTextStyles(c).titleText, fontSize: 20, marginTop: 24, marginBottom: 8 },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    entryText: { flex: 1 },
    entryTarget: { fontSize: 17, fontWeight: '700', color: c.text },
    entryTranslation: { fontSize: 13, color: c.muted },
    entryDelete: { paddingHorizontal: 8 },
  });

