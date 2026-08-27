import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, titleText, sectionTitle, mutedText } from '../theme';
import type { ProgressStats } from '../core/types';

interface Props {
  languageName: string;
  onReview: () => void;
  onParentZone: () => void;
  loadStats: () => Promise<ProgressStats>;
}

function StatTile({
  icon,
  value,
  label,
  tint,
  soft,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
  tint: string;
  soft: string;
}) {
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={mutedText}>{label}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  tint,
  soft,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  soft: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={mutedText}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

/**
 * Child home, matching the reference design: greeting header with
 * streak pill, deep-green hero card with progress + Continue, 2x2
 * stat tiles, and a "What should we do today?" action list.
 */
export default function HomeScreen({ languageName, onReview, onParentZone, loadStats }: Props) {
  const [stats, setStats] = useState<ProgressStats | null>(null);

  useEffect(() => {
    loadStats().then(setStats).catch(() => undefined);
  }, [loadStats]);

  const streak = stats?.streakDays ?? 0;
  const mastered = stats?.mastered ?? 0;
  const accuracy = stats?.accuracy30d == null ? '—' : `${Math.round(stats.accuracy30d * 100)}%`;
  const pct = stats && stats.total > 0 ? Math.min(100, Math.round((mastered / stats.total) * 100)) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={titleText}>Dumela!</Text>
          <Text style={mutedText}>Ready to learn {languageName}?</Text>
        </View>
        <View style={styles.streakPill}>
          <Ionicons name="flame" size={16} color={colors.dark} />
          <Text style={styles.streakText}>{streak}</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <Ionicons name="calendar-outline" size={12} color="#fff" />
            <Text style={styles.heroBadgeText}>Daily practice</Text>
          </View>
          <Pressable
            style={styles.continueBtn}
            onPress={onReview}
            accessibilityLabel="Continue learning"
          >
            <Text style={styles.continueText}>Continue</Text>
            <Ionicons name="play" size={14} color={colors.dark} />
          </Pressable>
        </View>
        <Text style={styles.heroLanguage}>{languageName}</Text>
        <View style={styles.heroProgressRow}>
          <Text style={styles.heroProgressLabel}>Progress</Text>
          <Text style={styles.heroProgressLabel}>{pct}%</Text>
        </View>
        <View style={styles.heroBarTrack}>
          <View style={[styles.heroBarFill, { width: `${pct}%` }]} />
        </View>
      </View>

      {/* 2x2 stat tiles */}
      <View style={styles.tiles}>
        <StatTile icon="trophy" value={`${mastered}`} label="Words Mastered" tint={colors.primary} soft={colors.primarySoft} />
        <StatTile icon="flame" value={`${streak}`} label="Day Streak" tint="#C98A1B" soft={colors.accentSoft} />
        <StatTile icon="stats-chart" value={accuracy} label="Accuracy" tint={colors.primary} soft={colors.primarySoft} />
        <StatTile icon="timer-outline" value={`${stats?.minutesSpent ?? 0}`} label="Minutes Practised" tint="#C98A1B" soft={colors.accentSoft} />
      </View>

      {/* Action list */}
      <Text style={[sectionTitle, styles.sectionSpacing]}>What should we do today?</Text>
      <ActionRow
        icon="mic"
        tint="#fff"
        soft={colors.accent}
        title="Practice Daily Words"
        subtitle="Listen and pick the meaning"
        onPress={onReview}
      />
      <ActionRow
        icon="bar-chart-outline"
        tint={colors.primary}
        soft={colors.primarySoft}
        title="See My Progress"
        subtitle="For mom and dad"
        onPress={onParentZone}
      />
      <ActionRow
        icon="lock-closed-outline"
        tint={colors.primary}
        soft={colors.primarySoft}
        title="Parent Zone"
        subtitle="Add words and record audio"
        onPress={onParentZone}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 140 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    marginTop: 8,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  streakText: { fontSize: 15, fontWeight: '800', color: colors.text },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  continueText: { fontSize: 13, fontWeight: '800', color: colors.text },
  heroLanguage: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 14 },
  heroProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroProgressLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  heroBarTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  heroBarFill: { height: 7, borderRadius: 4, backgroundColor: '#fff' },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  tile: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tileValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  sectionSpacing: { marginTop: 24, marginBottom: 10 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 2 },
});

