import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, childButton, titleText, bigText } from '../theme';
import type { ProgressStats } from '../core/types';

interface Props {
  languageName: string;
  onReview: () => void;
  onParentZone: () => void;
  loadStats: () => Promise<ProgressStats>;
}

/**
 * Child-facing home. Minimal text, huge touch targets, audio-first.
 * The parent zone is deliberately small and out of the child's way.
 */
export default function HomeScreen({ languageName, onReview, onParentZone, loadStats }: Props) {
  const [stats, setStats] = useState<ProgressStats | null>(null);

  useEffect(() => {
    loadStats().then(setStats).catch(() => undefined);
  }, [loadStats]);

  return (
    <View style={styles.container}>
      <Text style={styles.hello}>
        {stats && stats.streakDays > 0 ? `🔥 ${stats.streakDays} day${stats.streakDays === 1 ? '' : 's'} in a row!` : '🌟 Let’s learn!'}
      </Text>
      <Text style={titleText}>{languageName} ⭐</Text>

      <Pressable style={[childButton, styles.playButton]} onPress={onReview} accessibilityLabel="Start learning">
        <Text style={styles.playEmoji}>🎉</Text>
        <Text style={styles.playText}>Play & Learn!</Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable style={styles.parentButton} onPress={onParentZone} accessibilityLabel="Parent zone">
          <Text style={styles.parentText}>Parent zone 🔒</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  hello: {
    fontSize: 20,
    color: colors.accent,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  playButton: {
    backgroundColor: colors.primary,
    marginTop: 32,
    paddingVertical: 32,
  },
  playEmoji: { fontSize: 56 },
  playText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  footer: { position: 'absolute', bottom: 24, right: 24 },
  parentButton: {
    borderWidth: 2,
    borderColor: colors.muted,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  parentText: { ...bigText, fontSize: 14, color: colors.muted },
});
