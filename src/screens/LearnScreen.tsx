import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { makeTextStyles, useTheme, childButton, type ThemeColors } from '../theme';
import { TAB_BAR_SPACE } from '../components/TabBar';
import { listVocabulary } from '../db/repositories';
import { playClip, requestMicPermission, startRecording, stopActiveClip, useClipToggle, type ActiveRecording } from '../audio';
import WordImage from '../components/WordImage';
import CircleFrame from '../components/CircleFrame';
import { judgePronunciation, thresholdForDifficulty, type PronunciationVerdict } from '../core/pronunciation';
import {
  requestSpeechPermission,
  speechAvailable,
  startDictation,
  type DictationSession,
} from '../services/speech';
import type { VocabularyEntry } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
}

type LearnTab = 'revision' | 'pronunciation';

/** BCP-47 tag used for speech recognition of the target language. */
const SPEECH_LANG = 'tn-ZA';

const CARD_TINTS = [0, 1, 2, 3] as const;

/**
 * Learn section: browse every word as picture + Setswana + English
 * (Revision), and hear a word then say it back with real on-device
 * speech matching (Pronunciation). Purely learning — nothing recorded
 * to the spaced-repetition schedule here.
 */
export default function LearnScreen({ db, languageId }: Props) {
  const [words, setWords] = useState<VocabularyEntry[] | null>(null);
  const [tab, setTab] = useState<LearnTab>('revision');

  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    listVocabulary(db, languageId)
      .then(setWords)
      .catch(() => setWords([]));
  }, [db, languageId]);

  useEffect(() => stopActiveClip, []);

  return (
    <View style={styles.container}>
      {/* Pinned segmented Revision / Pronunciation toggle (AppHeader shows the title). */}
      <View style={[styles.header, { paddingTop: 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.segment}>
            {(['revision', 'pronunciation'] as LearnTab[]).map((key) => (
              <Pressable
                key={key}
                style={[styles.segmentBtn, tab === key && styles.segmentBtnOn]}
                onPress={() => setTab(key)}
                accessibilityLabel={key === 'revision' ? 'Revision tab' : 'Pronunciation tab'}
              >
                <Ionicons
                  name={key === 'revision' ? 'albums-outline' : 'mic-outline'}
                  size={15}
                  color={tab === key ? c.onPrimary : c.muted}
                />
                <Text style={[styles.segmentText, tab === key && styles.segmentTextOn]}>
                  {key === 'revision' ? 'Revision' : 'Pronunciation'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + TAB_BAR_SPACE },
        ]}
        scrollIndicatorInsets={{
          bottom: insets.bottom + TAB_BAR_SPACE,
          left: 0,
          right: 0,
        }}
      >
        {words === null ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 40 }} />
        ) : words.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="library-outline" size={56} color={c.muted} />
            <Text style={t.sectionTitle}>No words yet</Text>
            <Text style={t.mutedText}>
              Ask a parent to add words in the Parent Zone first.
            </Text>
          </View>
        ) : tab === 'revision' ? (
          <RevisionList words={words} styles={styles} />
        ) : (
          <PronunciationPractice words={words} styles={styles} />
        )}
      </ScrollView>
    </View>
  );
}

/** Picture + Setswana + English browse cards; tap to hear / pause the word. */
function RevisionList({
  words,
  styles,
}: {
  words: VocabularyEntry[];
  styles: Record<string, object>;
}) {
  return (
    <View style={styles.grid}>
      {words.map((word, i) => (
        <RevisionCard key={word.id} word={word} index={i} styles={styles} />
      ))}
    </View>
  );
}

/** A single revison card whose tap toggles play/pause for its own clip. */
function RevisionCard({
  word,
  index,
  styles,
}: {
  word: VocabularyEntry;
  index: number;
  styles: Record<string, object>;
}) {
  const { colors: c } = useTheme();
  const t = makeTextStyles(c);
  const tint = CARD_TINTS[index % CARD_TINTS.length];
  const { playing, toggle } = useClipToggle(word.audioUri);
  return (
    <Pressable
      style={[
        styles.revisionCard,
        tint === 0 && styles.tintPrimarySoft,
        tint === 1 && styles.tintAccentSoft,
        tint === 2 && styles.tintCard,
        tint === 3 && styles.tintBg,
      ]}
      onPress={toggle}
      accessibilityLabel={`Word card: ${word.targetText}`}
    >
      <CircleFrame size={72} backgroundColor={c.card} style={styles.revisionImageCircle}>
        <WordImage uri={word.imageUri} style={styles.revisionImage} iconSize={44} />
      </CircleFrame>
      <Text style={styles.revisionWord}>{word.targetText}</Text>
      <Text style={t.mutedText}>{word.translation}</Text>
      {word.audioUri ? (
        <View style={styles.audioBadge}>
          <Ionicons
            name={playing ? 'pause' : 'volume-high'}
            size={12}
            color={playing ? c.accent : c.primaryDeep}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Hear a word, then say it back — checked with on-device speech recognition. */
function PronunciationPractice({
  words,
  styles,
}: {
  words: VocabularyEntry[];
  styles: Record<string, object>;
}) {
  const { colors: c } = useTheme();
  const t = makeTextStyles(c);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'result'>('idle');
  const [transcript, setTranscript] = useState('');
  const [verdict, setVerdict] = useState<PronunciationVerdict | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [fallbackRecording, setFallbackRecording] = useState<ActiveRecording | null>(null);
  const dictationRef = useRef<DictationSession | null>(null);
  /** Set when Stop is tapped before startRecording() has resolved. */
  const stopRequestedRef = useRef(false);
  const word = words[idx % words.length];
  const speech = speechAvailable();
  const { playing: hearing, toggle } = useClipToggle(word?.audioUri);

  const stopDictation = useCallback(() => {
    dictationRef.current?.stop();
    dictationRef.current = null;
  }, []);

  // Reset + autoplay the word when moving to the next one.
  useEffect(() => {
    setPhase('idle');
    setTranscript('');
    setVerdict(null);
    setErrorMsg('');
    setRecordedUri(null);
    if (word?.audioUri) playClip(word.audioUri).catch(() => undefined);
    return stopDictation;
  }, [word?.id, stopDictation, word]);

  async function sayIt() {
    setErrorMsg('');
    if (speech) {
      const granted = await requestSpeechPermission();
      if (!granted) {
        setErrorMsg('Microphone permission is needed to check pronunciation.');
        return;
      }
      setTranscript('');
      setVerdict(null);
      setPhase('listening');
      dictationRef.current = startDictation(SPEECH_LANG, {
        onPartial: (text) => setTranscript(text),
        onFinal: (text) => {
          setTranscript(text);
          setVerdict(judgePronunciation(text, word.targetText, thresholdForDifficulty(word.difficulty)));
          setPhase('result');
        },
        onError: (message) => {
          setErrorMsg(message);
          setPhase('result');
        },
      });
      return;
    }
    // Fallback (Expo Go): no native recognizer — record & replay instead.
    try {
      const granted = await requestMicPermission();
      if (!granted) {
        setErrorMsg('Microphone permission is needed to record your voice.');
        return;
      }
      setTranscript('');
      setVerdict(null);
      setPhase('listening');
      stopRequestedRef.current = false;
      const active = await startRecording();
      if (stopRequestedRef.current) {
        // Stop was tapped before the recorder finished starting up.
        stopRequestedRef.current = false;
        await stopFallbackRecording(active);
        return;
      }
      setFallbackRecording(active);
    } catch {
      setErrorMsg('Could not start recording.');
      setPhase('idle');
    }
  }

  async function stopFallbackRecording(active: ActiveRecording) {
    try {
      const uri = await active.stop();
      setRecordedUri(uri);
    } catch {
      setErrorMsg('Could not save the recording.');
    }
    setFallbackRecording(null);
    setPhase('result');
  }

  async function stopIt() {
    if (speech) {
      stopDictation();
      setPhase('result');
      return;
    }
    if (fallbackRecording) {
      await stopFallbackRecording(fallbackRecording);
    } else {
      // Recorder hasn't finished starting yet — stop it as soon as it does.
      stopRequestedRef.current = true;
    }
  }

  function nextWord() {
    setIdx((i) => (i + 1) % words.length);
  }


  return (
    <View>
      <View style={styles.practiceCard}>
        <CircleFrame size={120} backgroundColor={c.accentSoft} style={styles.practiceImageCircle}>
          <WordImage uri={word.imageUri} style={styles.revisionImage} iconSize={64} />
        </CircleFrame>
        <Text style={styles.practiceWord}>{word.targetText}</Text>
        <Text style={t.mutedText}>{word.translation}</Text>

        <Pressable
          style={[childButton, styles.hearButton]}
          onPress={toggle}
        >
          <Ionicons name={hearing ? 'pause' : 'volume-high'} size={26} color={c.onAccent} />
          <Text style={styles.menuButtonText}>{hearing ? 'Pause' : 'Hear it'}</Text>
        </Pressable>

        <View style={styles.speechNotice}>
          <Ionicons name="information-circle-outline" size={16} color={c.muted} />
          <Text style={styles.speechNoticeText}>
            {speech
              ? 'Tap Say it, then speak clearly.'
              : 'Speech checking needs the full app build — here you can record and listen to yourself.'}
          </Text>
        </View>

        {phase !== 'listening' ? (
          <Pressable style={[childButton, styles.sayButton]} onPress={sayIt}>
            <Ionicons name="mic" size={26} color={c.onPrimary} />
            <Text style={styles.nextText}>Say it</Text>
          </Pressable>
        ) : (
          <Pressable style={[childButton, styles.stopButton]} onPress={stopIt}>
            <Ionicons name="stop-circle" size={26} color={c.onPrimary} />
            <Text style={styles.nextText}>
              {speech ? 'Listening… tap when done' : 'Recording… tap to stop'}
            </Text>
          </Pressable>
        )}

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      </View>

      {phase === 'result' && (
        <View style={styles.resultCard}>
          {verdict ? (
            <>
              <Ionicons
                name={verdict.correct ? 'checkmark-circle' : 'close-circle'}
                size={44}
                color={verdict.correct ? c.correct : c.wrong}
              />
              <Text style={styles.resultTitle}>
                {verdict.correct ? 'Ke botlhale! That’s it!' : 'Almost — try again!'}
              </Text>
              <Text style={t.mutedText}>Heard: “{transcript}”</Text>
            </>
          ) : recordedUri ? (
            <>
              <Ionicons name="mic-outline" size={44} color={c.primaryDeep} />
              <Text style={styles.resultTitle}>Your turn recorded!</Text>
              <Pressable
                style={[styles.chipButton, { backgroundColor: c.primarySoft }]}
                onPress={() => recordedUri && playClip(recordedUri).catch(() => undefined)}
              >
                <Ionicons name="play" size={16} color={c.primaryDeep} />
                <Text style={styles.chipButtonText}>Play my voice</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Ionicons name="chatbubble-ellipses-outline" size={44} color={c.primaryDeep} />
              <Text style={styles.resultTitle}>Try saying it once more</Text>
            </>
          )}
        </View>
      )}

      <Pressable style={[childButton, styles.nextCardButton]} onPress={nextWord}>
        <Text style={styles.nextText}>Next word</Text>
        <Ionicons name="arrow-forward" size={24} color={c.onPrimary} />
      </Pressable>
    </View>
  );
}


const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20 },
    header: {
      paddingHorizontal: 20,
      backgroundColor: c.background,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 3,
      gap: 2,
    },
    segmentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 15,
    },
    segmentBtnOn: { backgroundColor: c.primary },
    segmentText: { fontSize: 12, fontWeight: '700', color: c.muted },
    segmentTextOn: { color: c.onPrimary },
    emptyState: { alignItems: 'center', gap: 8, marginTop: 60 },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
    },
    revisionCard: {
      width: '48.5%',
      borderRadius: 20,
      padding: 14,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
      shadowColor: c.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    tintPrimarySoft: { backgroundColor: c.primarySoft, borderColor: c.card },
    tintAccentSoft: { backgroundColor: c.accentSoft, borderColor: c.card },
    tintCard: { backgroundColor: c.card },
    tintBg: { backgroundColor: c.background, borderColor: c.primarySoft },
    revisionImageCircle: {
      marginBottom: 8,
    },
    revisionImage: { width: 64, height: 64, borderRadius: 32 },
    revisionWord: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
    },
    audioBadge: {
      marginTop: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    practiceCard: {
      backgroundColor: c.card,
      borderRadius: 24,
      padding: 20,
      alignItems: 'center',
      shadowColor: c.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    practiceImageCircle: {
      marginBottom: 12,
    },
    practiceWord: {
      fontSize: 34,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
      marginTop: 4,
    },
    hearButton: {
      backgroundColor: c.accent,
      paddingVertical: 18,
      alignSelf: 'stretch',
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
      marginBottom: 0,
    },
    sayButton: {
      backgroundColor: c.primary,
      paddingVertical: 18,
      alignSelf: 'stretch',
      flexDirection: 'row',
      gap: 10,
    },
    stopButton: {
      backgroundColor: c.primarySoft,
      paddingVertical: 18,
      alignSelf: 'stretch',
      flexDirection: 'row',
      gap: 10,
    },
    speechNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      marginBottom: 4,
      alignSelf: 'stretch',
    },
    speechNoticeText: {
      flex: 1,
      fontSize: 12,
      color: c.muted,
      fontWeight: '600',
    },
    errorText: {
      marginTop: 8,
      fontSize: 13,
      fontWeight: '600',
      color: c.danger,
      textAlign: 'center',
    },
    resultCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 16,
      alignItems: 'center',
      gap: 6,
      marginTop: 14,
    },
    resultTitle: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: 'center' },
    chipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    chipButtonText: { fontSize: 13, fontWeight: '700', color: c.text },
    nextCardButton: {
      backgroundColor: c.primary,
      paddingVertical: 18,
      flexDirection: 'row',
      gap: 10,
      alignSelf: 'stretch',
    },
    nextText: { fontSize: 22, fontWeight: '800', color: c.onPrimary },
    menuButtonText: { fontSize: 18, fontWeight: '800', color: c.onAccent },
  });

