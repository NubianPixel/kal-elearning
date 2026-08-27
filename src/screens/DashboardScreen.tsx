import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
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

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
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
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.close}>✖️</Text>
        </Pressable>
      </View>

      {!stats ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard emoji="🏆" label="Words mastered" value={`${stats.mastered}`} />
            <StatCard emoji="📖" label="Learning" value={`${stats.learning}`} />
            <StatCard emoji="🔥" label="Day streak" value={`${stats.streakDays}`} />
            <StatCard emoji="🎯" label="Accuracy (30d)" value={stats.accuracy30d === null ? '—' : `${Math.round(stats.accuracy30d * 100)}%`} />
            <StatCard emoji="⏱" label="Minutes practised" value={`${stats.minutesSpent}`} />
            <StatCard emoji="📅" label="Reviews today" value={`${stats.reviewsToday}`} />
          </View>

          <View style={styles.milestoneCard}>
            <Text style={styles.milestoneTitle}>
              {milestone
                ? `Next milestone: ${milestone.emoji} ${milestone.label}`
                : '🌟 All milestones achieved!'}
            </Text>
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
            <Text style={styles.refreshText}>🔄 Refresh</Text>
          </Pressable>

          <Pressable style={[childButton, styles.manageButton]} onPress={onManageContent}>
            <Text style={styles.refreshText}>✏️ Manage words</Text>
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
  },
  statEmoji: { fontSize: 24 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, textAlign: 'center' },
  milestoneCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
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
  refresh: { backgroundColor: colors.primary, paddingVertical: 16, marginTop: 16 },
  refreshText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  manageButton: { backgroundColor: colors.accent, paddingVertical: 16 },
});
