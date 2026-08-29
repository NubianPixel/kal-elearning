import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { colors, titleText, sectionTitle, mutedText } from '../theme';
import { getProgressStats, getWeeklyActivity, getDailyGoal, setDailyGoal, type DayActivity } from '../db/repositories';
import { MILESTONES } from '../core/progress';
import { DAILY_GOAL_OPTIONS } from '../core/goals';
import type { ProgressStats } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  languageName: string;
  onExit: () => void;
  onManageContent: () => void;
}

/**
 * Parent dashboard, matching the reference design: green hero summary,
 * weekly practice-activity bar chart, achievement medal row, and the
 * stat grid. Concrete, queryable progress per the project prompt.
 */
export default function DashboardScreen({ db, languageId, languageName, onExit, onManageContent }: Props) {
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [week, setWeek] = useState<DayActivity[]>([]);
  const [goal, setGoal] = useState(5);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    setStats(await getProgressStats(db, languageId));
    setWeek(await getWeeklyActivity(db, languageId));
    setGoal(await getDailyGoal(db));
  }, [db, languageId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const maxCount = Math.max(1, ...week.map((d) => d.count));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
      scrollIndicatorInsets={{ top: insets.top + 12, bottom: insets.bottom + 24, left: 0, right: 0 }}
    >
      <View style={styles.header}>
        <View>
          <Text style={titleText}>Progress</Text>
          <Text style={mutedText}>{languageName} — all data on this device only</Text>
        </View>
        <Pressable onPress={onExit} hitSlop={12} accessibilityLabel="Back to home">
          <Ionicons name="close-circle" size={30} color={colors.muted} />
        </Pressable>
      </View>

      {!stats ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Green hero summary */}
          <View style={styles.hero}>
            <View style={styles.heroRow}>
              <View style={styles.heroAvatar}>
                <Ionicons name="person" size={26} color="#fff" />
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.heroTitle}>Your learner</Text>
                <View style={styles.heroChipsRow}>
                  <View style={styles.heroChip}>
                    <Ionicons name="book" size={11} color="#fff" />
                    <Text style={styles.heroChipText}>{stats.total} words</Text>
                  </View>
                  <View style={styles.heroChip}>
                    <Ionicons name="flame" size={11} color="#fff" />
                    <Text style={styles.heroChipText}>{stats.streakDays}-day streak</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{stats.mastered}</Text>
                <Text style={styles.heroStatLabel}>Mastered</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{stats.learning}</Text>
                <Text style={styles.heroStatLabel}>Learning</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {stats.accuracy30d == null ? '—' : `${Math.round(stats.accuracy30d * 100)}%`}
                </Text>
                <Text style={styles.heroStatLabel}>Accuracy 30d</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{stats.minutesSpent}</Text>
                <Text style={styles.heroStatLabel}>Minutes</Text>
              </View>
            </View>
          </View>

          {/* Practice activity — weekly bar chart */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeaderRow}>
              <Text style={sectionTitle}>Practice Activity</Text>
              <Text style={mutedText}>{stats.reviewsToday} today</Text>
            </View>
            <View style={styles.chartArea}>
              {week.map((d) => (
                <View key={d.label + d.count} style={styles.chartCol}>
                  <View style={styles.chartBarTrack}>
                    <View
                      style={[
                        styles.chartBar,
                        { height: `${Math.max(6, (d.count / maxCount) * 100)}%` },
                        d.isToday ? styles.chartBarToday : null,
                      ]}
                    />
                  </View>
                  <Text style={[styles.chartLabel, d.isToday && styles.chartLabelToday]}>
                    {d.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Achievement medals */}
          <Text style={[sectionTitle, styles.sectionSpacing]}>Achievement</Text>
          <View style={styles.achievements}>
            {MILESTONES.map((m) => {
              const unlocked = stats.mastered >= m.target;
              return (
                <View key={m.label} style={styles.medal}>
                  <View
                    style={[
                      styles.medalCircle,
                      unlocked ? styles.medalUnlocked : styles.medalLocked,
                    ]}
                  >
                    <Ionicons
                      name={m.icon as React.ComponentProps<typeof Ionicons>['name']}
                      size={22}
                      color={unlocked ? '#fff' : '#B9B7A8'}
                    />
                  </View>
                  <Text style={[styles.medalTarget, unlocked && styles.medalTargetUnlocked]}>
                    {Math.min(stats.mastered, m.target)} of {m.target}
                  </Text>
                  <Text style={styles.medalLabel}>{m.label}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.note}>
            A word counts as mastered after 3 correct reviews spaced 21+ days apart
            (spaced-repetition schedule).
          </Text>

          {/* Daily goal setting */}
          <View style={styles.goalCard}>
            <Text style={sectionTitle}>Daily goal</Text>
            <Text style={mutedText}>New words introduced each practice day</Text>
            <View style={styles.goalChips}>
              {DAILY_GOAL_OPTIONS.map((n) => (
                <Pressable
                  key={n}
                  style={[styles.goalChip, goal === n && styles.goalChipOn]}
                  onPress={() => {
                    setGoal(n);
                    setDailyGoal(db, n).catch(() => undefined);
                  }}
                >
                  <Text style={goal === n ? styles.goalChipTextOn : styles.goalChipText}>
                    {n} words
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable style={styles.manageRow} onPress={onManageContent}>
            <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.manageTitle}>Manage words</Text>
              <Text style={mutedText}>Add words, record audio</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        </>
      )}
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
  hero: { backgroundColor: colors.primary, borderRadius: 24, padding: 18, marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMeta: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 6 },
  heroChipsRow: { flexDirection: 'row', gap: 8 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroStatValue: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  chartCard: { backgroundColor: colors.card, borderRadius: 20, padding: 16 },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  chartCol: { flex: 1, alignItems: 'center', gap: 6 },
  chartBarTrack: { height: 110, width: '100%', justifyContent: 'flex-end' },
  chartBar: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: colors.primary,
    opacity: 0.85,
  },
  chartBarToday: { backgroundColor: colors.accent, opacity: 1 },
  chartLabel: { fontSize: 10, fontWeight: '700', color: colors.muted },
  chartLabelToday: { color: colors.text },
  sectionSpacing: { marginTop: 24, marginBottom: 12 },
  achievements: { flexDirection: 'row', justifyContent: 'space-between' },
  medal: { alignItems: 'center', width: '19%', gap: 4 },
  medalCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalUnlocked: { backgroundColor: colors.accent },
  medalLocked: { backgroundColor: '#EEEBDD' },
  medalTarget: { fontSize: 9, fontWeight: '800', color: colors.muted },
  medalTargetUnlocked: { color: '#C98A1B' },
  medalLabel: { fontSize: 9, fontWeight: '700', color: colors.text, textAlign: 'center' },
  note: { fontSize: 12, color: colors.muted, marginTop: 20, lineHeight: 18 },
  goalCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
    gap: 8,
  },
  goalChips: { flexDirection: 'row', gap: 8, marginTop: 4 },
  goalChip: {
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  goalChipOn: { backgroundColor: colors.primary },
  goalChipText: { color: colors.text, fontWeight: '700' },
  goalChipTextOn: { color: '#fff', fontWeight: '700' },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    marginTop: 16,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1 },
  manageTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 2 },
});
