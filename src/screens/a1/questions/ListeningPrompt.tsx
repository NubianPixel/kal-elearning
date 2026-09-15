import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, useTheme, type ThemeColors } from '../../../theme';
import { audioFor } from '../../../content';
import { useClipToggle } from '../../../audio';

interface Props {
  /** The item (or dialogue line) id whose audio should play. */
  audioId: string;
  /** The Setswana text to show ONLY when no recording is bundled yet (dev fallback). */
  fallbackText: string;
}

/**
 * Listening question prompt: a big play button for the item's audio,
 * never showing the written Setswana. Content has no recordings yet, so
 * when `audioFor(audioId)` is undefined we fall back to showing the
 * Setswana text with a small "No recording yet" badge, so the flow stays
 * testable until audio is authored.
 */
export default function ListeningPrompt({ audioId, fallbackText }: Props) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const assetId = audioFor(audioId);
  const clip = useClipToggle(assetId);

  if (assetId === undefined) {
    return (
      <View style={styles.fallbackCard}>
        <Text style={styles.fallbackText}>{fallbackText}</Text>
        <View style={styles.badge}>
          <Ionicons name="alert-circle-outline" size={14} color={c.muted} />
          <Text style={styles.badgeText}>No recording yet</Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.playCard}
      onPress={clip.toggle}
      accessibilityLabel={clip.playing ? 'Pause the sound' : 'Play the sound'}
    >
      <Ionicons name={clip.playing ? 'pause-circle' : 'play-circle'} size={72} color={c.primary} />
      <Text style={styles.playHint}>{clip.playing ? 'Playing…' : 'Tap to listen'}</Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    playCard: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      borderRadius: 24,
      backgroundColor: c.card,
      ...cardShadow(c, 'md'),
    },
    playHint: { marginTop: 8, fontSize: 14, fontWeight: '700', color: c.muted },
    fallbackCard: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      borderRadius: 24,
      backgroundColor: c.card,
      ...cardShadow(c, 'md'),
    },
    fallbackText: { fontSize: 28, fontWeight: '800', color: c.text },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 10,
      backgroundColor: c.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeText: { fontSize: 11, fontWeight: '700', color: c.muted },
  });
