import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type * as SQLite from 'expo-sqlite';
import { colors, childButton, titleText } from '../theme';
import { getProgressStats } from '../db/repositories';
import { MILESTONES, nextMilestone } from '../core/progress';
import type { ProgressStats } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  languageName: string;
  onExit: () => void;
  onManageContent: () => void;
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={24} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Parent dashboard: concrete, queryable progress per the prompt's
 * success criteria — mastery counts, streak, accuracy, time spent,
 * and progress toward defined milestones.
 */
export default function DashboardScreen({ db, languageId, languageName, onExit, onManageContent }: Props) {
  const [stats, setStats] = useState<ProgressStats | null>(null);

  const load = useCallback(async () => {
    setStats(await getProgressStats(db, languageId));
  }, [db, languageId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const milestone = stats ? nextMilestone(stats.mastered) : null;
  const prevTarget = milestone
    ? MILESTONES.filter((m) => m.target <= milestone.target).slice(-1)[0]?.target ?? 0
    : 0;
  const milestoneProgress =
    stats && milestone ? Math.min(1, stats.mastered / milestone.target) : 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={titleText}>{languageName} Progress</Text>
        <Pressable onPress={onExit} hitSlop={12} accessibilityLabel="Close dashboard">
          <Ionicons name="close-circle" size={30} color={colors.muted} />
        </Pressable>
      </View>

      {!stats ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard icon="trophy-outline" label="Words mastered" value={`${stats.mastered}`} />
            <StatCard icon="book-outline" label="Learning" value={`${stats.learning}`} />
            <StatCard icon="flame" label="Day streak" value={`${stats.streakDays}`} />
            <StatCard icon="stats-chart-outline" label="Accuracy (30d)" value={stats.accuracy30d === null ? '—' : `${Math.round(stats.accuracy30d * 100)}%`} />
            <StatCard icon="timer-outline" label="Minutes practised" value={`${stats.minutesSpent}`} />
            <StatCard icon="calendar-outline" label="Reviews today" value={`${stats.reviewsToday}`} />
          </View>

          <View style={styles.milestoneCard}>
            <View style={styles.milestoneTitleRow}>
              {milestone && (
                <Ionicons
                  name={milestone.icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={20}
                  color={colors.accent}
                />
              )}
              <Text style={styles.milestoneTitle}>
                {milestone ? `Next milestone: ${milestone.label}` : 'All milestones achieved!'}
              </Text>
            </View>
            {milestone && (
              <>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${milestoneProgress * 100}%` }]} />
                </View>
                <Text style={styles.milestoneSub}>
                  {stats.mastered} / {milestone.target} words mastered
                </Text>
              </>
            )}
          </View>

          <Text style={styles.note}>
            A word counts as mastered after {3} correct reviews spaced {21}+ days apart
            (spaced-repetition schedule). All data is stored on this device only.
          </Text>

          <Pressable style={[childButton, styles.refresh]} onPress={() => load().catch(() => undefined)}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>

          <Pressable style={[childButton, styles.manageButton]} onPress={onManageContent}>
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.refreshText}>Manage words</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  close: { fontSize: 24 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: {
    width: '31.5%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, textAlign: 'center' },
  milestoneCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  milestoneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  milestoneTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  milestoneSub: { fontSize: 13, color: colors.muted, marginTop: 6 },
  barTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EEE6D4',
    marginTop: 10,
  },
  barFill: { height: 12, borderRadius: 6, backgroundColor: colors.accent },
  note: { fontSize: 12, color: colors.muted, marginTop: 16, lineHeight: 18 },
  refresh: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  refreshText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  manageButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    flexDirection: 'row',
    gap: 10,
  },
});
