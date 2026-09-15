import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Switch, StyleSheet, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import { dialogueForUnit, audioFor, type DialogueLine } from '../../content';
import { markStepComplete, saveSpeakingRating, recentAgainItems, type SpeakingRating } from '../../db/progress';
import {
  playClip,
  stopActiveClip,
  ensurePlaybackMode,
  requestMicPermission,
  startRecording,
  deleteRecording,
  useClipToggle,
  type ActiveRecording,
} from '../../audio';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { checkAndMarkGoal } from './pathData';

interface Props {
  db: SQLite.SQLiteDatabase;
  unit: number;
  onDone: () => void;
}

/** Use it: the unit dialogue — listen, read, and record-and-compare per line. */
export default function UseItStep({ db, unit, onDone }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const lines = useMemo(() => dialogueForUnit(unit), [unit]);
  const [againIds, setAgainIds] = useState<Set<string>>(new Set());
  const [showEnglish, setShowEnglish] = useState(false);
  const [playingAllIndex, setPlayingAllIndex] = useState<number | null>(null);
  const playAllToken = useRef(0);

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

  function playAll() {
    const token = ++playAllToken.current;
    stopActiveClip();
    const step = (i: number) => {
      if (token !== playAllToken.current || i >= lines.length) {
        if (token === playAllToken.current) setPlayingAllIndex(null);
        return;
      }
      setPlayingAllIndex(i);
      const assetId = audioFor(lines[i].id);
      if (assetId === undefined) {
        setTimeout(() => step(i + 1), 1100);
        return;
      }
      playClip(assetId, (e) => {
        if (e.kind === 'finished' && token === playAllToken.current) step(i + 1);
      }).catch(() => step(i + 1));
    };
    step(0);
  }

  function stopPlayAll() {
    playAllToken.current += 1;
    setPlayingAllIndex(null);
    stopActiveClip();
  }

  async function finish() {
    playAllToken.current += 1;
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

      <View style={styles.controlsRow}>
        <Pressable
          style={[primaryButton, styles.playAllButton]}
          onPress={playingAllIndex !== null ? stopPlayAll : playAll}
          accessibilityLabel={playingAllIndex !== null ? 'Stop playing' : 'Play the whole dialogue'}
        >
          <Ionicons name={playingAllIndex !== null ? 'stop' : 'play'} size={18} color={c.onAccent} />
          <Text style={styles.playAllText}>{playingAllIndex !== null ? 'Stop' : 'Play all'}</Text>
        </Pressable>
        <View style={styles.englishToggle}>
          <Text style={t.mutedText}>Show English</Text>
          <Switch value={showEnglish} onValueChange={setShowEnglish} accessibilityLabel="Show English translation" />
        </View>
      </View>

      {lines.map((line, i) => (
        <DialogueLineCard
          key={line.id}
          line={line}
          highlighted={playingAllIndex === i}
          showEnglish={showEnglish}
          recording={recordingLineId === line.id && !recordedUri}
          hasRecorded={recordingLineId === line.id && !!recordedUri}
          justRated={ratedLineId === line.id}
          onToggleRecord={() => toggleRecord(line)}
          onPlayMine={() => recordedUri && playClip(recordedUri)}
          onRate={(rating) => rate(line, rating)}
        />
      ))}

      <Pressable style={[primaryButton, styles.finishButton]} onPress={finish} accessibilityLabel="Finish Use It">
        <Text style={styles.finishText}>Finish</Text>
        <Ionicons name="checkmark" size={20} color={c.onAccent} />
      </Pressable>
    </ScrollView>
  );
}

interface LineCardProps {
  line: DialogueLine;
  highlighted: boolean;
  showEnglish: boolean;
  recording: boolean;
  hasRecorded: boolean;
  justRated: boolean;
  onToggleRecord: () => void;
  onPlayMine: () => void;
  onRate: (rating: SpeakingRating) => void;
}

function DialogueLineCard({
  line,
  highlighted,
  showEnglish,
  recording,
  hasRecorded,
  justRated,
  onToggleRecord,
  onPlayMine,
  onRate,
}: LineCardProps) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const assetId = audioFor(line.id);
  const clip = useClipToggle(assetId);

  return (
    <View style={[styles.lineCard, highlighted && styles.lineCardHighlighted]}>
      <Text style={styles.speaker}>{line.speaker}</Text>
      <View style={styles.lineRow}>
        <Pressable
          style={[styles.lineAudioButton, assetId === undefined && styles.lineAudioButtonDisabled]}
          onPress={() => assetId !== undefined && clip.toggle()}
          disabled={assetId === undefined}
          accessibilityLabel={clip.playing ? 'Pause this line' : 'Play this line'}
        >
          <Ionicons name={clip.playing ? 'pause' : 'volume-medium'} size={18} color={c.onPrimary} />
        </Pressable>
        <View style={styles.lineTextWrap}>
          <Text style={styles.lineSt}>{line.setswana}</Text>
          {showEnglish ? <Text style={styles.lineEn}>{line.english}</Text> : null}
          {assetId === undefined ? <Text style={styles.noAudio}>No recording yet</Text> : null}
        </View>
      </View>

      <View style={styles.recordRow}>
        <Pressable
          style={[styles.micButton, recording && styles.micButtonActive]}
          onPress={onToggleRecord}
          accessibilityLabel={recording ? 'Stop recording' : 'Record yourself saying this line'}
        >
          <Ionicons name={recording ? 'stop' : 'mic'} size={18} color={recording ? c.onAccent : c.primaryDeep} />
          <Text style={styles.micLabel}>{recording ? 'Stop' : 'Record'}</Text>
        </Pressable>
        {hasRecorded && (
          <Pressable style={styles.playMineButton} onPress={onPlayMine} accessibilityLabel="Play your recording">
            <Ionicons name="play" size={16} color={c.primaryDeep} />
            <Text style={styles.playMineText}>Play mine</Text>
          </Pressable>
        )}
      </View>

      {hasRecorded && (
        <View style={styles.rateRow}>
          <Pressable style={styles.rateButton} onPress={() => onRate('nailed')} accessibilityLabel="Nailed it">
            <Text style={styles.rateText}>Nailed it</Text>
          </Pressable>
          <Pressable style={styles.rateButton} onPress={() => onRate('close')} accessibilityLabel="Close">
            <Text style={styles.rateText}>Close</Text>
          </Pressable>
          <Pressable style={styles.rateButton} onPress={() => onRate('again')} accessibilityLabel="Again">
            <Text style={styles.rateText}>Again</Text>
          </Pressable>
        </View>
      )}
      {justRated && !hasRecorded && <Text style={styles.ratedNote}>Saved — no audio kept.</Text>}
    </View>
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
    controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    playAllButton: { backgroundColor: c.primary, flexDirection: 'row', gap: 8, marginVertical: 0, minHeight: 48 },
    playAllText: { fontSize: 15, fontWeight: '800', color: c.onPrimary },
    englishToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lineCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      ...cardShadow(c, 'sm'),
    },
    lineCardHighlighted: { borderWidth: 2, borderColor: c.accent },
    speaker: { fontSize: 12, fontWeight: '800', color: c.muted, marginBottom: 6 },
    lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    lineAudioButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineAudioButtonDisabled: { opacity: 0.4 },
    lineTextWrap: { flex: 1 },
    lineSt: { fontSize: 17, fontWeight: '700', color: c.text },
    lineEn: { fontSize: 14, fontWeight: '600', color: c.muted, marginTop: 2 },
    noAudio: { fontSize: 11, fontWeight: '700', color: c.muted, marginTop: 2 },
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
