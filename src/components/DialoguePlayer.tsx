import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../theme';
import { audioFor, type DialogueLine } from '../content';
import { playClip, stopActiveClip, useClipToggle } from '../audio';

interface Props {
  lines: DialogueLine[];
  showEnglish: boolean;
  onToggleEnglish: (value: boolean) => void;
  /** Extra content rendered under a line (e.g. UseIt's record-and-compare
   *  controls). Omitted entirely for read-only replay (Library › Stories). */
  renderLineExtra?: (line: DialogueLine, highlighted: boolean) => React.ReactNode;
}

/**
 * Shared dialogue UI: "Play all" (karaoke-style current-line highlight) +
 * "Show English" toggle + one row per line with its own play button. Used
 * by the Use-it step (with record-and-compare below each line) and the
 * Library's read-only story replay (without it).
 */
export default function DialoguePlayer({ lines, showEnglish, onToggleEnglish, renderLineExtra }: Props) {
  const { colors: c } = useTheme();
  const t = useMemo(() => makeTextStyles(c), [c]);
  const styles = useMemo(() => makeStyles(c), [c]);
  const [playingAllIndex, setPlayingAllIndex] = useState<number | null>(null);
  const playAllToken = useRef(0);

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

  return (
    <View>
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
          <Switch value={showEnglish} onValueChange={onToggleEnglish} accessibilityLabel="Show English translation" />
        </View>
      </View>

      {lines.map((line, i) => (
        <DialogueLineRow
          key={line.id}
          line={line}
          highlighted={playingAllIndex === i}
          showEnglish={showEnglish}
          extra={renderLineExtra?.(line, playingAllIndex === i)}
        />
      ))}
    </View>
  );
}

function DialogueLineRow({
  line,
  highlighted,
  showEnglish,
  extra,
}: {
  line: DialogueLine;
  highlighted: boolean;
  showEnglish: boolean;
  extra?: React.ReactNode;
}) {
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
      {extra}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineAudioButtonDisabled: { opacity: 0.4 },
    lineTextWrap: { flex: 1 },
    lineSt: { fontSize: 17, fontWeight: '700', color: c.text },
    lineEn: { fontSize: 14, fontWeight: '600', color: c.muted, marginTop: 2 },
    noAudio: { fontSize: 11, fontWeight: '700', color: c.muted, marginTop: 2 },
  });
