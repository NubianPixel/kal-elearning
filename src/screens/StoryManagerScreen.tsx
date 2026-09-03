import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type * as SQLite from 'expo-sqlite';
import { makeTextStyles, useTheme, type ThemeColors } from '../theme';
import { playClip, stopActiveClip, requestMicPermission, startRecording } from '../audio';
import {
  createStory,
  createStoryLine,
  deleteStory,
  deleteStoryLine,
  listStories,
  listStoryLines,
  updateStoryLine,
} from '../db/repositories';
import type { Story, StoryLine } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  onBack: () => void;
}

interface RecState {
  lineId: number | 'new';
  lang: 'st' | 'en';
}

/**
 * Parent-authored stories for Story Time. The parent creates a story,
 * adds lines of Setswana + English text, and records a pronunciation
 * clip for each half. The child's Story Time player then reads lines in
 * order with words highlighting in time with the audio.
 */
export default function StoryManagerScreen({ db, languageId, onBack }: Props) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [selected, setSelected] = useState<Story | null>(null);
  const [lines, setLines] = useState<StoryLine[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newSt, setNewSt] = useState('');
  const [newEn, setNewEn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState<RecState | null>(null);
  const recorderRef = useRef<{ stop: () => Promise<string | null> } | null>(null);
  const pendingAudio = useRef<{ st: string | null; en: string | null }>({ st: null, en: null });
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);

  const refreshStories = useCallback(async () => {
    setLoading(true);
    try {
      setStories(await listStories(db, languageId));
    } catch {
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [db, languageId]);

  useEffect(() => {
    refreshStories().catch(() => undefined);
  }, [refreshStories]);

  useEffect(() => () => stopActiveClip(), []);

  const openStory = useCallback(
    async (story: Story) => {
      setSelected(story);
      try {
        setLines(await listStoryLines(db, story.id));
      } catch {
        setLines([]);
      }
    },
    [db],
  );

  const backToList = useCallback(() => {
    setSelected(null);
    refreshStories().catch(() => undefined);
  }, [refreshStories]);

  async function addStory() {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const story = await createStory(db, languageId, title, null);
      setNewTitle('');
      setStories((prev) => [...(prev ?? []), story]);
      await openStory(story);
    } finally {
      setSaving(false);
    }
  }

  async function removeStory(story: Story) {
    Alert.alert('Delete story?', `Remove "${story.title}" and all its lines?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteStory(db, story.id)
            .then(() => setStories((prev) => (prev ?? []).filter((s) => s.id !== story.id)))
            .catch(() => undefined);
        },
      },
    ]);
  }

  /* ---- Recording ---- */

  async function toggleRecord(key: { lineId: number | 'new'; lang: 'st' | 'en' }) {
    if (recording && recording.lineId === key.lineId && recording.lang === key.lang) {
      // Stop the active recording and attach it.
      const uri = await recorderRef.current?.stop();
      recorderRef.current = null;
      setRecording(null);
      if (uri) applyAudio(key, uri);
      return;
    }
    // Stop any existing recording first.
    if (recorderRef.current) {
      try {
        await recorderRef.current.stop();
      } catch {
        // ignored
      }
      recorderRef.current = null;
    }
    setRecording(null);
    const granted = await requestMicPermission();
    if (!granted) {
      Alert.alert('Microphone needed', 'Allow microphone access to record pronunciations.');
      return;
    }
    try {
      const rec = await startRecording();
      recorderRef.current = rec;
      setRecording(key);
    } catch {
      Alert.alert('Recording error', 'Could not start recording.');
    }
  }

  function applyAudio(key: { lineId: number | 'new'; lang: 'st' | 'en' }, uri: string | null) {
    const field = key.lang === 'st' ? 'audioSt' : 'audioEn';
    if (key.lineId === 'new') {
      pendingAudio.current = { ...pendingAudio.current, [field]: uri };
      return;
    }
    setLines((prev) =>
      prev.map((l) => (l.id === key.lineId ? { ...l, [field]: uri } : l)),
    );
    const line = lines.find((l) => l.id === key.lineId);
    if (line) {
      updateStoryLine(db, key.lineId, {
        textSt: line.textSt,
        textEn: line.textEn,
        audioSt: key.lang === 'st' ? uri : line.audioSt,
        audioEn: key.lang === 'en' ? uri : line.audioEn,
      }).catch(() => undefined);
    }
  }

  async function addLine() {
    if (!selected || !newSt.trim()) {
      Alert.alert('Missing text', 'Add the Setswana words for this line.');
      return;
    }
    setSaving(true);
    try {
      await createStoryLine(db, selected.id, {
        textSt: newSt.trim(),
        textEn: newEn.trim() || null,
        audioSt: pendingAudio.current.st,
        audioEn: pendingAudio.current.en,
      });
      pendingAudio.current = { st: null, en: null };
      setNewSt('');
      setNewEn('');
      setLines(await listStoryLines(db, selected.id));
    } finally {
      setSaving(false);
    }
  }

  async function saveLine(line: StoryLine) {
    setSaving(true);
    try {
      await updateStoryLine(db, line.id, {
        textSt: line.textSt,
        textEn: line.textEn,
        audioSt: line.audioSt,
        audioEn: line.audioEn,
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeLine(id: number) {
    await deleteStoryLine(db, id);
    if (selected) setLines(await listStoryLines(db, selected.id));
  }

  /* ---- Render: story list ---- */

  if (!selected) {
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
            <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back to words">
              <Ionicons name="chevron-back" size={28} color={c.primaryDeep} />
            </Pressable>
            <Text style={t.titleText}>Stories</Text>
            <View style={{ width: 28 }} />
          </View>

          <Text style={styles.hint}>
            Write little stories, add an English translation, and record the lines — then the
            child listens and follows the highlighted words in Story Time.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>New story</Text>
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, styles.flex1]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Story title, e.g. The cat"
                placeholderTextColor={c.muted}
                onSubmitEditing={addStory}
              />
              <Pressable
                style={[styles.chip, styles.chipWithIcon, !newTitle.trim() && styles.disabled]}
                onPress={addStory}
                disabled={!newTitle.trim() || saving}
              >
                <Ionicons name="add" size={16} color={c.text} />
                <Text style={styles.chipText}>Add</Text>
              </Pressable>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 30 }} size="large" color={c.primary} />
          ) : (stories ?? []).length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={44} color={c.muted} />
              <Text style={styles.emptyTitle}>No stories yet</Text>
              <Text style={styles.emptyHint}>Add your first story above.</Text>
            </View>
          ) : (
            (stories ?? []).map((s) => (
              <View key={s.id} style={styles.storyRow}>
                <Pressable style={styles.storyRowMain} onPress={() => void openStory(s)}>
                  <View style={[styles.storyIcon, { backgroundColor: c.primarySoft }]}>
                    <Ionicons
                      name={(s.icon ?? 'book-outline') as React.ComponentProps<typeof Ionicons>['name']}
                      size={20}
                      color={c.primaryDeep}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storyTitle}>{s.title}</Text>
                    <Text style={styles.storyMeta}>Tap to add lines & audio</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={c.muted} />
                </Pressable>
                <Pressable
                  onPress={() => removeStory(s)}
                  hitSlop={8}
                  style={styles.storyDelete}
                  accessibilityLabel={`Delete ${s.title}`}
                >
                  <Ionicons name="trash-outline" size={20} color={c.danger} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const isRec = (lineId: number | 'new', lang: 'st' | 'en') =>
    recording !== null && recording.lineId === lineId && recording.lang === lang;

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
          <Pressable onPress={backToList} hitSlop={12} accessibilityLabel="Back to stories">
            <Ionicons name="chevron-back" size={28} color={c.primaryDeep} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={t.titleText}>{selected.title}</Text>
            <Text style={styles.storyMeta}>{lines.length} lines</Text>
          </View>
        </View>

        {/* Existing lines */}
        {lines.map((line, li) => (
          <View key={line.id} style={styles.lineCard}>
            <View style={styles.lineNumBadge}>
              <Text style={styles.lineNumText}>{li + 1}</Text>
            </View>

            <Text style={styles.fieldLabel}>Setswana</Text>
            <TextInput
              style={styles.input}
              value={line.textSt}
              onChangeText={(v) =>
                setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, textSt: v } : l)))
              }
              placeholder="Setswana words"
              placeholderTextColor={c.muted}
            />

            <Text style={styles.fieldLabel}>English</Text>
            <TextInput
              style={styles.input}
              value={line.textEn ?? ''}
              onChangeText={(v) =>
                setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, textEn: v } : l)))
              }
              placeholder="English translation"
              placeholderTextColor={c.muted}
            />
            <View style={styles.audioActions}>
              <Pressable
                style={[styles.recBtn, isRec(line.id, 'st') && styles.recBtnOn]}
                onPress={() => void toggleRecord({ lineId: line.id, lang: 'st' })}
              >
                <Ionicons
                  name={isRec(line.id, 'st') ? 'stop' : 'mic'}
                  size={15}
                  color={isRec(line.id, 'st') ? c.onPrimary : c.primaryDeep}
                />
                <Text style={isRec(line.id, 'st') ? styles.recBtnTextOn : styles.recBtnText}>
                  {line.audioSt ? 'Re-record' : 'Record'} Setswana
                </Text>
              </Pressable>
              {line.audioSt ? (
                <Pressable
                  style={styles.smallBtn}
                  onPress={() => playClip(line.audioSt!, () => undefined).catch(() => undefined)}
                >
                  <Ionicons name="play" size={15} color={c.text} />
                  <Text style={styles.smallBtnText}>Listen</Text>
                </Pressable>
              ) : null}

              {line.textEn ? (
                <>
                  <Pressable
                    style={[styles.recBtn, isRec(line.id, 'en') && styles.recBtnOn]}
                    onPress={() => void toggleRecord({ lineId: line.id, lang: 'en' })}
                  >
                    <Ionicons
                      name={isRec(line.id, 'en') ? 'stop' : 'mic'}
                      size={15}
                      color={isRec(line.id, 'en') ? c.onPrimary : c.primaryDeep}
                    />
                    <Text style={isRec(line.id, 'en') ? styles.recBtnTextOn : styles.recBtnText}>
                      {line.audioEn ? 'Re-record' : 'Record'} English
                    </Text>
                  </Pressable>
                  {line.audioEn ? (
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => playClip(line.audioEn!, () => undefined).catch(() => undefined)}
                    >
                      <Ionicons name="play" size={15} color={c.text} />
                      <Text style={styles.smallBtnText}>Listen</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>

            <View style={styles.lineActions}>
              <Pressable
                style={[styles.chip, styles.chipWithIcon, saving && styles.disabled]}
                onPress={() => void saveLine(line)}
                disabled={saving}
              >
                <Ionicons name="save-outline" size={15} color={c.text} />
                <Text style={styles.chipText}>Save line</Text>
              </Pressable>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => void removeLine(line.id)}
                accessibilityLabel="Delete line"
              >
                <Ionicons name="trash-outline" size={16} color={c.danger} />
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={[styles.lineCard, styles.newLineCard]}>
          <Text style={styles.cardLabel}>Add a line</Text>
          <Text style={styles.fieldLabel}>Setswana</Text>
          <TextInput
            style={styles.input}
            value={newSt}
            onChangeText={setNewSt}
            placeholder="e.g. Katse o rata botswa"
            placeholderTextColor={c.muted}
          />
          <Text style={styles.fieldLabel}>English (optional)</Text>
          <TextInput
            style={styles.input}
            value={newEn}
            onChangeText={setNewEn}
            placeholder="e.g. The cat loves milk"
            placeholderTextColor={c.muted}
          />

          <View style={styles.audioActions}>
            <Pressable
              style={[styles.recBtn, isRec('new', 'st') && styles.recBtnOn]}
              onPress={() => void toggleRecord({ lineId: 'new', lang: 'st' })}
            >
              <Ionicons
                name={isRec('new', 'st') ? 'stop' : 'mic'}
                size={15}
                color={isRec('new', 'st') ? c.onPrimary : c.primaryDeep}
              />
              <Text style={isRec('new', 'st') ? styles.recBtnTextOn : styles.recBtnText}>
                {pendingAudio.current.st ? 'Re-record' : 'Record'} Setswana
              </Text>
            </Pressable>
            {pendingAudio.current.st ? (
              <Pressable
                style={styles.smallBtn}
                onPress={() =>
                  playClip(pendingAudio.current.st!, () => undefined).catch(() => undefined)
                }
              >
                <Ionicons name="play" size={15} color={c.text} />
                <Text style={styles.smallBtnText}>Listen</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.recBtn, isRec('new', 'en') && styles.recBtnOn]}
              onPress={() => void toggleRecord({ lineId: 'new', lang: 'en' })}
            >
              <Ionicons
                name={isRec('new', 'en') ? 'stop' : 'mic'}
                size={15}
                color={isRec('new', 'en') ? c.onPrimary : c.primaryDeep}
              />
              <Text style={isRec('new', 'en') ? styles.recBtnTextOn : styles.recBtnText}>
                {pendingAudio.current.en ? 'Re-record' : 'Record'} English
              </Text>
            </Pressable>
            {pendingAudio.current.en ? (
              <Pressable
                style={styles.smallBtn}
                onPress={() =>
                  playClip(pendingAudio.current.en!, () => undefined).catch(() => undefined)
                }
              >
                <Ionicons name="play" size={15} color={c.text} />
                <Text style={styles.smallBtnText}>Listen</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            style={[
              styles.chip,
              styles.chipWithIcon,
              (!newSt.trim() || saving) && styles.disabled,
            ]}
            onPress={addLine}
            disabled={!newSt.trim() || saving}
          >
            <Ionicons name="add-circle-outline" size={15} color={c.text} />
            <Text style={styles.chipText}>Add line to story</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 48 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    hint: { color: c.muted, fontSize: 13, marginBottom: 14, lineHeight: 18 },
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
    addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    flex1: { flex: 1 },
    input: {
      borderWidth: 1,
      borderColor: c.primarySoft,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.background,
    },
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
    chipText: { color: c.text, fontWeight: '600' },
    disabled: { opacity: 0.5 },
    empty: { alignItems: 'center', marginTop: 48, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    emptyHint: { fontSize: 14, color: c.muted, textAlign: 'center' },
    storyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 16,
      marginBottom: 10,
    },
    storyRowMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
    },
    storyIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storyTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    storyMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
    storyDelete: { paddingHorizontal: 14 },

    /* Line editor */
    lineCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    newLineCard: { borderWidth: 2, borderStyle: 'dashed', borderColor: c.primarySoft },
    lineNumBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineNumText: { color: c.primaryDeep, fontWeight: '800', fontSize: 13 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.muted, marginTop: 8, marginBottom: 4 },
    audioActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    recBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 2,
      borderColor: c.primary,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: c.background,
    },
    recBtnOn: { backgroundColor: c.danger, borderColor: c.danger },
    recBtnText: { color: c.primaryDeep, fontWeight: '700', fontSize: 13 },
    recBtnTextOn: { color: c.onPrimary, fontWeight: '700', fontSize: 13 },
    smallBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: c.primarySoft,
    },
    smallBtnText: { color: c.primaryDeep, fontWeight: '700', fontSize: 13 },
    lineActions: { flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'center' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
    deleteText: { color: c.danger, fontWeight: '600', fontSize: 13 },
  });