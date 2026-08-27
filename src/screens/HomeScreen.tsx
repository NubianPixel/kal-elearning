import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
      {stats && stats.streakDays > 0 ? (
        <View style={styles.streakRow}>
          <Ionicons name="flame" size={22} color={colors.accent} />
          <Text style={styles.hello}>
            {stats.streakDays} day{stats.streakDays === 1 ? '' : 's'} in a row!
          </Text>
        </View>
      ) : (
        <View style={styles.streakRow}>
          <Ionicons name="sunny" size={22} color={colors.accent} />
          <Text style={styles.hello}>Let’s learn!</Text>
        </View>
      )}
      <Text style={titleText}>{languageName}</Text>

      <Pressable style={[childButton, styles.playButton]} onPress={onReview} accessibilityLabel="Start learning">
        <Ionicons name="play-circle" size={72} color="#fff" />
        <Text style={styles.playText}>Play & Learn!</Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable style={styles.parentButton} onPress={onParentZone} accessibilityLabel="Parent zone">
          <Ionicons name="lock-closed" size={16} color={colors.muted} />
          <Text style={styles.parentText}>Parent zone</Text>
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
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  hello: {
    fontSize: 20,
    color: colors.accent,
    fontWeight: '700',
    textAlign: 'center',
  },
  playButton: {
    backgroundColor: colors.primary,
    marginTop: 32,
    paddingVertical: 28,
    gap: 8,
  },
  playText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  footer: { position: 'absolute', bottom: 24, right: 24 },
  parentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: colors.muted,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  parentText: { ...bigText, fontSize: 14, color: colors.muted },
});
