import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { useTheme, type ThemeColors } from '../theme';
import { TAB_BAR_SPACE } from '../components/TabBar';
import { playClip, stopActiveClip } from '../audio';
import { listStories, listStoryLines } from '../db/repositories';
import type { Story, StoryLine } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  onExit: () => void;
}

/** How the story is read aloud. */
type ReadMode = 'st' | 'en' | 'both';
/** Which half of a line is being spoken in 'both' mode. */
type LinePart = 'st' | 'en';

/** Fallback pace when a line has no recording: calm read-along speed. */
const DEFAULT_MS_PER_WORD = 420;

const MODE_LABELS: Record<ReadMode, string> = {
  st: 'Setswana',
  en: 'English',
  both: 'Both',
};

/**
 * Story Time — the child listens to a story in Setswana and/or English
 * while the words highlight one-by-one, karaoke style, in time with the
 * parent's recording. Lines without audio highlight at a gentle default
 * reading pace so the story always works.
 */
export default function StoryScreen({ db, languageId, onExit }: Props) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [openStory, setOpenStory] = useState<Story | null>(null);
  const [lines, setLines] = useState<StoryLine[]>([]);
  const [mode, setMode] = useState<ReadMode>('both');
  const [lineIdx, setLineIdx] = useState(0);
  const [part, setPart] = useState<LinePart>('st');
  const [wordIdx, setWordIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  useEffect(() => {
    listStories(db, languageId)
      .then(setStories)
      .catch(() => setStories([]));
  }, [db, languageId]);

  /* ---------------- Playback engine ---------------- */

  const sessionRef = useRef(0);
  const wordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (wordTimerRef.current) clearInterval(wordTimerRef.current);
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    wordTimerRef.current = null;
    fallbackRef.current = null;
  }, []);

  useEffect(
    () => () => {
      sessionRef.current++;
      clearTimers();
      stopActiveClip();
    },
    [clearTimers],
  );

  /** Highlight words one-by-one across `totalMs`, then resolve. */
  const startWordTimer = useCallback(
    (count: number, totalMs: number, token: number, onDone: () => void) => {
      clearTimers();
      if (count === 0) {
        onDone();
        return;
      }
      const step = Math.max(120, totalMs / count);
      let i = 0;
      setWordIdx(0);
      wordTimerRef.current = setInterval(() => {
        if (sessionRef.current !== token) {
          clearTimers();
          return;
        }
        i++;
        if (i >= count) {
          clearTimers();
          // Hold the last word briefly before moving on.
          fallbackRef.current = setTimeout(() => {
            if (sessionRef.current === token) onDone();
          }, Math.min(600, step));
        } else {
          setWordIdx(i);
        }
      }, step);
    },
    [clearTimers],
  );

  /** Ref so advance() can always reach the latest playPart. */
  const playFromRef = useRef<(line: number, part: LinePart, token: number) => void>(
    () => undefined,
  );

  const advance = useCallback(
    (fromLine: number, fromPart: LinePart, token: number) => {
      if (sessionRef.current !== token) return;
      clearTimers();
      const nextPart: LinePart | null =
        fromPart === 'st' && mode === 'both' ? 'en' : null;
      if (nextPart) {
        playFromRef.current(fromLine, nextPart, token);
        return;
      }
      if (fromLine + 1 < lines.length) {
        playFromRef.current(fromLine + 1, mode === 'en' ? 'en' : 'st', token);
        return;
      }
      // The End.
      setPlaying(false);
      setWordIdx(-1);
    },
    [mode, lines.length, clearTimers],
  );

  /** Starts (or restarts) playback of one line part. */
  const playPart = useCallback(
    (lineIdx: number, part: LinePart, token: number) => {
      const line = lines[lineIdx];
      if (!line || sessionRef.current !== token) return;
      setLineIdx(lineIdx);
      setPart(part);
      setPlaying(true);

      const text = (part === 'st' ? line.textSt : line.textEn) ?? '';
      const words = text.split(/\s+/).filter(Boolean);
      const uri = part === 'st' ? line.audioSt : line.audioEn;

      if (!text) {
        // Empty half (e.g. no English text) — skip straight on.
        advance(lineIdx, part, token);
        return;
      }

      const silentRead = () =>
        startWordTimer(words.length, words.length * DEFAULT_MS_PER_WORD, token, () =>
          advance(lineIdx, part, token),
        );

      if (uri) {
        playClip(uri, (e) => {
          if (sessionRef.current !== token) return;
          if (e.kind === 'loaded' && e.durationMs) {
            startWordTimer(words.length, e.durationMs, token, () =>
              advance(lineIdx, part, token),
            );
          } else if (e.kind === 'finished') {
            advance(lineIdx, part, token);
          } else if (e.kind === 'error') {
            silentRead();
          }
        }).catch(silentRead);
        // Safety net if the 'loaded' event never arrives.
        fallbackRef.current = setTimeout(() => {
          if (sessionRef.current === token && wordTimerRef.current === null) {
            silentRead();
          }
        }, 2500);
      } else {
        silentRead();
      }
    },
    [lines, advance, startWordTimer],
  );
  playFromRef.current = playPart;

  /* ---------------- Player controls ---------------- */

  const openPlayer = useCallback(
    async (story: Story) => {
      sessionRef.current++;
      clearTimers();
      stopActiveClip();
      setOpenStory(story);
      try {
        const ls = await listStoryLines(db, story.id);
        setLines(ls);
        if (ls.length > 0) {
          playFromRef.current(0, 'st', sessionRef.current);
        }
      } catch {
        setLines([]);
      }
    },
    [db, clearTimers],
  );

  const closePlayer = useCallback(() => {
    sessionRef.current++;
    clearTimers();
    stopActiveClip();
    setOpenStory(null);
    setPlaying(false);
    setWordIdx(-1);
  }, [clearTimers]);

  const togglePlay = useCallback(() => {
    if (playing) {
      sessionRef.current++;
      clearTimers();
      stopActiveClip();
      setPlaying(false);
      setWordIdx(-1);
    } else {
      playFromRef.current(lineIdx, part, sessionRef.current);
    }
  }, [playing, lineIdx, part, clearTimers]);

  const jumpLine = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= lines.length) return;
      sessionRef.current++;
      playFromRef.current(idx, mode === 'en' ? 'en' : 'st', sessionRef.current);
    },
    [lines.length, mode],
  );

  const changeMode = useCallback(
    (m: ReadMode) => {
      setMode(m);
      if (playing) {
        sessionRef.current++;
        playFromRef.current(lineIdx, m === 'en' ? 'en' : 'st', sessionRef.current);
      }
    },
    [playing, lineIdx],
  );

  /* ---------------- Render: story list ---------------- */

  if (!openStory) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 4, paddingBottom: insets.bottom + TAB_BAR_SPACE + 24 },
        ]}
      >
        <Text style={styles.screenTitle}>Story time</Text>
        <Text style={styles.screenSubtitle}>Listen and read along</Text>

        {stories === null ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color={c.primary} />
        ) : stories.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={44} color={c.muted} />
            <Text style={styles.emptyTitle}>No stories yet</Text>
            <Text style={styles.emptyHint}>
              Add stories in the Parent Zone under Manage Words → Stories.
            </Text>
          </View>
        ) : (
          stories.map((s) => (
            <Pressable
              key={s.id}
              style={styles.storyCard}
              onPress={() => void openPlayer(s)}
            >
              <View style={styles.storyIcon}>
                <Ionicons
                  name={(s.icon ?? 'book-outline') as React.ComponentProps<typeof Ionicons>['name']}
                  size={30}
                  color={c.primaryDeep}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storyTitle}>{s.title}</Text>
                <Text style={styles.storyMeta}>Tap to listen and read along</Text>
              </View>
              <Ionicons name="play-circle" size={40} color={c.primary} />
            </Pressable>
          ))
        )}

        <Pressable style={styles.backLink} onPress={onExit}>
          <Ionicons name="home-outline" size={16} color={c.muted} />
          <Text style={styles.backLinkText}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  /* ---------------- Render: player ---------------- */

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 4, paddingBottom: insets.bottom + TAB_BAR_SPACE + 24 },
        ]}
      >
        <Pressable style={styles.playerHeader} onPress={closePlayer}>
          <Ionicons name="chevron-back" size={26} color={c.primaryDeep} />
          <View style={{ flex: 1 }}>
            <Text style={styles.storyTitle}>{openStory.title}</Text>
            <Text style={styles.storyMeta}>
              Line {lineIdx + 1} of {lines.length}
            </Text>
          </View>
        </Pressable>

        {/* Language mode chips */}
        <View style={styles.modeChips}>
          {(['st', 'en', 'both'] as ReadMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.modeChip, mode === m && styles.modeChipOn]}
              onPress={() => changeMode(m)}
            >
              <Text style={mode === m ? styles.modeChipTextOn : styles.modeChipText}>
                {MODE_LABELS[m]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Story text with karaoke highlighting */}
        <View style={styles.storyBook}>
          {lines.map((line, li) => {
            const isActive = li === lineIdx;
            const readEn = mode === 'en' || (mode === 'both' && isActive && part === 'en');
            const words = (readEn && line.textEn ? line.textEn : line.textSt)
              .split(/\s+/)
              .filter(Boolean);
            // Highlight only when this half is what the voice is actually reading.
            const highlighting = isActive && playing && readEn === (part === 'en');
            return (
              <Pressable key={line.id} onPress={() => jumpLine(li)} style={styles.lineWrap}>
                <View style={styles.lineWords}>
                  {words.map((w, wi) => (
                    <Text
                      key={wi}
                      style={[
                        styles.word,
                        !isActive && styles.wordDim,
                        highlighting && wi === wordIdx && styles.wordActive,
                        highlighting && wi < wordIdx && styles.wordDone,
                      ]}
                    >
                      {w}
                    </Text>
                  ))}
                </View>
                {!readEn && line.textEn ? (
                  <Text style={[styles.lineEn, !isActive && styles.wordDim]}>
                    {line.textEn}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          <View style={styles.theEnd}>
            <Ionicons name="star" size={16} color={c.primary} />
            <Text style={styles.theEndText}>The end</Text>
          </View>
        </View>

        {lines[lineIdx] && !(part === 'st' ? lines[lineIdx].audioSt : lines[lineIdx].audioEn) ? (
          <Text style={styles.noAudioHint}>
            No recording for this line yet — following along at reading pace.
          </Text>
        ) : null}
      </ScrollView>

      {/* Transport controls */}
      <View style={[styles.controls, { bottom: insets.bottom + TAB_BAR_SPACE + 8 }]}>
        <Pressable style={styles.ctrlSide} onPress={() => jumpLine(lineIdx - 1)}>
          <Ionicons name="play-skip-back" size={24} color={c.text} />
        </Pressable>
        <Pressable style={styles.ctrlMain} onPress={togglePlay}>
          <Ionicons name={playing ? 'pause' : 'play'} size={30} color={c.onPrimary} />
        </Pressable>
        <Pressable style={styles.ctrlSide} onPress={() => jumpLine(lineIdx + 1)}>
          <Ionicons name="play-skip-forward" size={24} color={c.text} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 48 },

    /* List view */
    screenTitle: { fontSize: 30, fontWeight: '800', color: c.text, marginTop: 8 },
    screenSubtitle: { fontSize: 15, color: c.muted, marginBottom: 18 },
    storyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    storyIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storyTitle: { fontSize: 19, fontWeight: '800', color: c.text },
    storyMeta: { fontSize: 13, color: c.muted, marginTop: 2 },
    empty: { alignItems: 'center', marginTop: 48, gap: 6 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    emptyHint: { fontSize: 14, color: c.muted, textAlign: 'center', paddingHorizontal: 24 },
    backLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 20,
    },
    backLinkText: { color: c.muted, fontWeight: '600' },

    /* Player view */
    playerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    modeChips: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    modeChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.primarySoft,
      backgroundColor: c.card,
    },
    modeChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    modeChipText: { color: c.muted, fontWeight: '700', fontSize: 13 },
    modeChipTextOn: { color: c.onPrimary, fontWeight: '800', fontSize: 13 },
    storyBook: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 18,
      gap: 16,
    },
    lineWrap: { gap: 4 },
    lineWords: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
    word: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 8,
    },
    wordDim: { opacity: 0.35 },
    wordDone: { opacity: 0.75 },
    wordActive: {
      backgroundColor: c.primary,
      color: c.onDark,
      opacity: 1,
      overflow: 'hidden',
    },
    lineEn: { fontSize: 14, color: c.muted, paddingLeft: 5, fontStyle: 'italic' },
    theEnd: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 4,
    },
    theEndText: { color: c.muted, fontWeight: '600', fontSize: 13 },
    noAudioHint: {
      textAlign: 'center',
      color: c.muted,
      fontSize: 12,
      marginTop: 8,
    },

    /* Transport controls */
    controls: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    },
    ctrlSide: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 5,
      elevation: 4,
    },
    ctrlMain: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
  });

