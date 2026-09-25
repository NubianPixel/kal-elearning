import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { primaryButton, useTheme, type ThemeColors } from '../../theme';
import { dialogueForUnit, type DialogueLine } from '../../content';
import {
  markStepComplete,
  saveSpeakingRating,
  recentAgainItems,
  type SpeakingRating,
  type ProgressDb,
} from '../../db/progress';
import {
  playClip,
  stopActiveClip,
  ensurePlaybackMode,
  requestMicPermission,
  startRecording,
  deleteRecording,
  type ActiveRecording,
} from '../../audio';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import DialoguePlayer from '../../components/DialoguePlayer';
import { checkAndMarkGoal } from './pathData';

interface Props {
  db: ProgressDb;
  unit: number;
  onDone: () => void;
}

/** Use it: the unit dialogue — listen, read, and record-and-compare per line. */
export default function UseItStep({ db, unit, onDone }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const lines = useMemo(() => dialogueForUnit(unit), [unit]);
  const [againIds, setAgainIds] = useState<Set<string>>(new Set());
  const [showEnglish, setShowEnglish] = useState(false);

  // The one line with an in-progress or just-stopped, not-yet-rated
  // recording. PRIVACY: this temp uri is never persisted — only rated
  // ("nailed"/"close"/"again") and deleted right after, on switching
  // lines, on leaving this screen, or on app background.
  const [recordingLineId, setRecordingLineId] = useState<string | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [ratedLineId, setRatedLineId] = useState<string | null>(null);
  const recorderRef = useRef<ActiveRecording | null>(null);
  const recordedUriRef = useRef<string | null>(null);
  recordedUriRef.current = recordedUri;

  useEffect(() => {
    ensurePlaybackMode();
    recentAgainItems(db).then((ids) => {
      const lineIds = new Set(lines.map((l) => l.id));
      setAgainIds(new Set(ids.filter((id) => lineIds.has(id))));
    });
  }, [db, lines]);

  const cleanupPendingRecording = useRef(() => {
    if (recorderRef.current) {
      recorderRef.current.stop().then((uri) => deleteRecording(uri)).catch(() => undefined);
      recorderRef.current = null;
    }
    deleteRecording(recordedUriRef.current);
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cleanupPendingRecording.current();
    });
    return () => {
      sub.remove();
      stopActiveClip();
      cleanupPendingRecording.current();
    };
  }, []);

  async function toggleRecord(line: DialogueLine) {
    if (recordingLineId === line.id && !recordedUri) {
      // Stop this line's in-progress recording.
      const uri = (await recorderRef.current?.stop()) ?? null;
      recorderRef.current = null;
      setRecordedUri(uri);
      return;
    }
    // Starting a new line's recording — clean up any other pending one first.
    if (recordedUri) deleteRecording(recordedUri);
    if (recorderRef.current) {
      await recorderRef.current.stop().catch(() => undefined);
      recorderRef.current = null;
    }
    const granted = await requestMicPermission();
    if (!granted) return;
    setRecordedUri(null);
    setRatedLineId(null);
    setRecordingLineId(line.id);
    recorderRef.current = await startRecording();
  }

  async function rate(line: DialogueLine, rating: SpeakingRating) {
    await saveSpeakingRating(db, line.id, rating);
    deleteRecording(recordedUri);
    setRecordedUri(null);
    setRecordingLineId(null);
    setRatedLineId(line.id);
    if (rating === 'again') setAgainIds((s) => new Set(s).add(line.id));
    else setAgainIds((s) => {
      if (!s.has(line.id)) return s;
      const next = new Set(s);
      next.delete(line.id);
      return next;
    });
  }

  async function finish() {
    stopActiveClip();
    cleanupPendingRecording.current();
    await markStepComplete(db, unit, 'useit');
    await checkAndMarkGoal(db);
    onDone();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
      {againIds.size > 0 && (
        <View style={styles.againBanner}>
          <Ionicons name="refresh" size={16} color={c.primaryDeep} />
          <Text style={styles.againText}>
            Practise again: {lines.filter((l) => againIds.has(l.id)).map((l) => l.setswana).join(' · ')}
          </Text>
        </View>
      )}

      <DialoguePlayer
        lines={lines}
        showEnglish={showEnglish}
        onToggleEnglish={setShowEnglish}
        renderLineExtra={(line) => {
          const recording = recordingLineId === line.id && !recordedUri;
          const hasRecorded = recordingLineId === line.id && !!recordedUri;
          const justRated = ratedLineId === line.id;
          return (
            <View>
              <View style={styles.recordRow}>
                <Pressable
                  style={[styles.micButton, recording && styles.micButtonActive]}
                  onPress={() => toggleRecord(line)}
                  accessibilityLabel={recording ? 'Stop recording' : 'Record yourself saying this line'}
                >
                  <Ionicons name={recording ? 'stop' : 'mic'} size={18} color={recording ? c.onAccent : c.primaryDeep} />
                  <Text style={styles.micLabel}>{recording ? 'Stop' : 'Record'}</Text>
                </Pressable>
                {hasRecorded && (
                  <Pressable
                    style={styles.playMineButton}
                    onPress={() => recordedUri && playClip(recordedUri)}
                    accessibilityLabel="Play your recording"
                  >
                    <Ionicons name="play" size={16} color={c.primaryDeep} />
                    <Text style={styles.playMineText}>Play mine</Text>
                  </Pressable>
                )}
              </View>

              {hasRecorded && (
                <View style={styles.rateRow}>
                  <Pressable style={styles.rateButton} onPress={() => rate(line, 'nailed')} accessibilityLabel="Nailed it">
                    <Text style={styles.rateText}>Nailed it</Text>
                  </Pressable>
                  <Pressable style={styles.rateButton} onPress={() => rate(line, 'close')} accessibilityLabel="Close">
                    <Text style={styles.rateText}>Close</Text>
                  </Pressable>
                  <Pressable style={styles.rateButton} onPress={() => rate(line, 'again')} accessibilityLabel="Again">
                    <Text style={styles.rateText}>Again</Text>
                  </Pressable>
                </View>
              )}
              {justRated && !hasRecorded && <Text style={styles.ratedNote}>Saved — no audio kept.</Text>}
            </View>
          );
        }}
      />

      <Pressable style={[primaryButton, styles.finishButton]} onPress={finish} accessibilityLabel="Finish Use It">
        <Text style={styles.finishText}>Finish</Text>
        <Ionicons name="checkmark" size={20} color={c.onAccent} />
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    againBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.accentSoft,
      borderRadius: 14,
      padding: 12,
      marginBottom: 14,
    },
    againText: { flex: 1, fontSize: 13, fontWeight: '700', color: c.primaryDeep },
    recordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    micButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primarySoft,
      borderRadius: 14,
      paddingHorizontal: 12,
      minHeight: 40,
    },
    micButtonActive: { backgroundColor: c.danger },
    micLabel: { fontSize: 13, fontWeight: '800', color: c.primaryDeep },
    playMineButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, minHeight: 40 },
    playMineText: { fontSize: 13, fontWeight: '700', color: c.primaryDeep },
    rateRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    rateButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rateText: { fontSize: 13, fontWeight: '800', color: c.primaryDeep },
    ratedNote: { fontSize: 12, fontWeight: '600', color: c.muted, marginTop: 8 },
    finishButton: { backgroundColor: c.accent, flexDirection: 'row', gap: 8, marginTop: 16 },
    finishText: { fontSize: 17, fontWeight: '800', color: c.onAccent },
  });
