import React, { useCallback, useEffect, useState } from 'react';
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
import type * as SQLite from 'expo-sqlite';
import { colors, childButton, titleText } from '../theme';
import {
  createCategory,
  createVocabulary,
  deleteVocabulary,
  listCategories,
  listVocabulary,
  updateVocabulary,
  type VocabularyInput,
} from '../db/repositories';
import { playClip, requestMicPermission, startRecording, type ActiveRecording } from '../audio';
import type { Category, Difficulty, VocabularyEntry } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  languageName: string;
  onExit: () => void;
}

/** Empty form used for both "add" and "edit". */
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
  };
}

/**
 * Parent/admin screen: full CRUD for vocabulary entries plus one-tap
 * recording of pronunciation clips. Scoped strictly to content and
 * progress management — nothing else is privileged here.
 */
export default function AdminScreen({ db, languageId, languageName, onExit }: Props) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<(VocabularyInput & { id?: number }) | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [v, c] = await Promise.all([
      listVocabulary(db, languageId),
      listCategories(db, languageId),
    ]);
    setEntries(v);
    setCategories(c);
    setLoading(false);
  }, [db, languageId]);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

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
    });
  }

  async function toggleRecord() {
    try {
      if (recording) {
        const uri = await recording.stop();
        setRecording(null);
        if (uri) setForm((f) => (f ? { ...f, audioUri: uri } : f));
      } else {
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
    categories.find((c) => c.id === id)?.name ?? 'Uncategorised';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={titleText}>{languageName} — Admin</Text>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.close}>✖️</Text>
        </Pressable>
      </View>

      <Pressable style={[childButton, styles.primaryAction]} onPress={startAdd}>
        <Text style={styles.actionText}>➕ Add a word</Text>
      </Pressable>

      {form && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{form.id ? 'Edit word' : 'New word'}</Text>

          <Text style={styles.label}>Word ({languageName})</Text>
          <TextInput
            style={styles.input}
            value={form.targetText}
            onChangeText={(t) => setForm({ ...form, targetText: t })}
            placeholder="e.g. Dumela"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chipsRow}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, form.categoryId === c.id && styles.chipOn]}
                onPress={() => setForm({ ...form, categoryId: c.id })}
              >
                <Text style={form.categoryId === c.id ? styles.chipTextOn : styles.chipText}>
                  {c.emoji ? `${c.emoji} ` : ''}{c.name}
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
              placeholderTextColor={colors.muted}
            />
            <Pressable style={styles.chip} onPress={addCategory}>
              <Text style={styles.chipText}>➕ Add</Text>
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
                  {d === 1 ? '🙂 Easy' : d === 2 ? '😐 Medium' : '😅 Hard'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Pronunciation audio</Text>
          <View style={styles.chipsRow}>
            <Pressable style={[styles.chip, recording && styles.chipOn]} onPress={toggleRecord}>
              <Text style={recording ? styles.chipTextOn : styles.chipText}>
                {recording ? '⏹ Stop recording' : '🎤 Record'}
              </Text>
            </Pressable>
            {form.audioUri && !recording && (
              <>
                <Pressable
                  style={styles.chip}
                  onPress={() => playClip(form.audioUri!).catch(() => undefined)}
                >
                  <Text style={styles.chipText}>▶️ Preview</Text>
                </Pressable>
                <Pressable style={styles.chip} onPress={() => setForm({ ...form, audioUri: null })}>
                  <Text style={styles.chipText}>🗑 Remove</Text>
                </Pressable>
              </>
            )}
          </View>
          {!form.audioUri && !recording && (
            <Text style={styles.hint}>Optional — but audio helps a 7-year-old learn fastest.</Text>
          )}

          <View style={styles.formButtons}>
            <Pressable
              style={[childButton, styles.saveButton, (!form.targetText || !form.translation) && styles.disabled]}
              onPress={save}
              disabled={saving}
            >
              <Text style={styles.actionText}>{saving ? 'Saving…' : '💾 Save word'}</Text>
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
              {entry.audioUri ? ' · 🔊' : ''}
            </Text>
          </View>
          <Pressable onPress={() => startEdit(entry)} hitSlop={8}>
            <Text style={styles.entryAction}>✏️</Text>
          </Pressable>
          <Pressable onPress={() => removeEntry(entry)} hitSlop={8}>
            <Text style={styles.entryAction}>🗑</Text>
          </Pressable>
        </View>
      ))}
      {entries.length === 0 && (
        <Text style={styles.hint}>No words yet — add the first one above.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  close: { fontSize: 24 },
  primaryAction: { backgroundColor: colors.primary, paddingVertical: 20 },
  actionText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  form: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 16 },
  formTitle: { ...titleText, fontSize: 22, marginBottom: 8 },
  label: { fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  addCategoryRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  addCategoryInput: { flex: 1 },
  hint: { color: colors.muted, marginTop: 6, fontSize: 13 },
  formButtons: { marginTop: 16 },
  saveButton: { backgroundColor: colors.primary, paddingVertical: 18 },
  disabled: { opacity: 0.5 },
  cancelButton: { backgroundColor: 'transparent', paddingVertical: 8 },
  cancelText: { color: colors.muted, fontWeight: '700', textAlign: 'center' },
  listTitle: { ...titleText, fontSize: 20, marginTop: 24, marginBottom: 8 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  entryText: { flex: 1 },
  entryTarget: { fontSize: 17, fontWeight: '700', color: colors.text },
  entryTranslation: { fontSize: 13, color: colors.muted },
  entryAction: { fontSize: 20, paddingHorizontal: 8 },
});

