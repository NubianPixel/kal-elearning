import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeTextStyles, useTheme, type ThemeColors } from '../theme';
import { TAB_BAR_SPACE } from '../components/TabBar';
import ProgressBar from '../components/ProgressBar';
import { dailyProgressPct } from '../core/goals';
import { leagueForXp } from '../core/gamification';
import type { ProgressStats } from '../core/types';

interface Props {
  languageName: string;
  onReview: () => void;
  onLearn: () => void;
  onParentZone: () => void;
  loadStats: () => Promise<ProgressStats>;
  loadGoal: () => Promise<number>;
  loadXp: () => Promise<number>;
}

function StatTile({
  icon,
  value,
  label,
  tint,
  soft,
  styles,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
  tint: string;
  soft: string;
  styles: Record<string, object>;
}) {
  const t = makeTextStyles(useTheme().colors);
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={t.mutedText}>{label}</Text>
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
  styles,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  soft: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  styles: Record<string, object>;
}) {
  const t = makeTextStyles(useTheme().colors);
  const { colors: c } = useTheme();
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={t.mutedText}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.muted} />
    </Pressable>
  );
}

/**
 * Child home, matching the reference design: greeting header with
 * streak pill (pinned above the scroll), dusty-rose hero card with
 * progress + Continue, 2x2 stat tiles, and a "What should we do today?"
 * action list.
 */
export default function HomeScreen({
  languageName,
  onReview,
  onLearn,
  onParentZone,
  loadStats,
  loadGoal,
  loadXp,
}: Props) {
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [goal, setGoal] = useState(5);
  const [xp, setXp] = useState(0);
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadStats().then(setStats).catch(() => undefined);
    loadGoal().then(setGoal).catch(() => undefined);
    loadXp().then(setXp).catch(() => undefined);
  }, [loadStats, loadGoal, loadXp]);

  const streak = stats?.streakDays ?? 0;
  const mastered = stats?.mastered ?? 0;
  const accuracy = stats?.accuracy30d == null ? '—' : `${Math.round(stats.accuracy30d * 100)}%`;
  const league = leagueForXp(xp);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE },
        ]}
        scrollIndicatorInsets={{
          bottom: insets.bottom + TAB_BAR_SPACE,
          left: 0,
          right: 0,
        }}
      >
        {/* Habit + reward status row */}
        <View style={styles.statusRow}>
          <View style={styles.streakPill}>
            <Ionicons name="flame" size={16} color={c.primaryDeep} />
            <Text style={styles.streakText}>{streak}</Text>
          </View>
          <View style={styles.streakPill}>
            <Ionicons name="star" size={16} color={c.primaryDeep} />
            <Text style={styles.streakText}>{xp} XP</Text>
          </View>
          <View style={[styles.streakPill, styles.leaguePill]}>
            <Ionicons
              name={league.icon as React.ComponentProps<typeof Ionicons>['name']}
              size={16}
              color={c.onAccent}
            />
            <Text style={styles.streakText}>{league.name}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Ionicons name="calendar-outline" size={12} color={c.onPrimary} />
              <Text style={styles.heroBadgeText}>Daily practice</Text>
            </View>
            <Pressable
              style={styles.continueBtn}
              onPress={onReview}
              accessibilityLabel="Continue learning"
            >
              <Text style={styles.continueText}>Continue</Text>
              <Ionicons name="play" size={14} color={c.onPrimary} />
            </Pressable>
          </View>
          <Text style={styles.heroLanguage}>{languageName}</Text>
          <View style={styles.heroProgressRow}>
            <Text style={styles.heroProgressLabel}>Today</Text>
            <Text style={styles.heroProgressLabel}>
              {Math.min(stats?.reviewsToday ?? 0, goal)} of {goal} words
            </Text>
          </View>
          <ProgressBar
            pct={dailyProgressPct(stats?.reviewsToday ?? 0, goal)}
            trackColor={c.onPrimaryFaint}
            fillColor={c.onPrimary}
            height={7}
          />
        </View>

        {/* 2x2 stat tiles */}
        <View style={styles.tiles}>
          <StatTile icon="trophy" value={`${mastered}`} label="Words Mastered" tint={c.primary} soft={c.primarySoft} styles={styles} />
          <StatTile icon="flame" value={`${streak}`} label="Day Streak" tint={c.primaryDeep} soft={c.accentSoft} styles={styles} />
          <StatTile icon="stats-chart" value={accuracy} label="Accuracy" tint={c.primary} soft={c.primarySoft} styles={styles} />
          <StatTile icon={league.icon as React.ComponentProps<typeof Ionicons>['name']} value={league.name} label="League" tint={c.primaryDeep} soft={c.accentSoft} styles={styles} />
        </View>

        {/* Action list */}
        <Text style={[t.sectionTitle, styles.sectionSpacing]}>What should we do today?</Text>
        <ActionRow
          icon="mic"
          tint={c.onAccent}
          soft={c.accent}
          title="Practice Daily Words"
          subtitle="Listen and pick the meaning"
          onPress={onReview}
          styles={styles}
        />
        <ActionRow
          icon="school-outline"
          tint={c.primaryDeep}
          soft={c.accentSoft}
          title="Learning Cards"
          subtitle="Pictures, words and saying them"
          onPress={onLearn}
          styles={styles}
        />
        <ActionRow
          icon="bar-chart-outline"
          tint={c.primary}
          soft={c.primarySoft}
          title="See My Progress"
          subtitle="For mom and dad"
          onPress={onParentZone}
          styles={styles}
        />
        <ActionRow
          icon="lock-closed-outline"
          tint={c.primary}
          soft={c.primarySoft}
          title="Parent Zone"
          subtitle="Add words and record audio"
          onPress={onParentZone}
          styles={styles}
        />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statusRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
      flexWrap: 'wrap',
    },
    leaguePill: { backgroundColor: c.accent },
    streakText: { fontSize: 15, fontWeight: '800', color: c.text },
    hero: {
      backgroundColor: c.primary,
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
      backgroundColor: c.onPrimaryFaint,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    heroBadgeText: { color: c.onPrimary, fontSize: 11, fontWeight: '700' },
    continueBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primarySoft,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    continueText: { fontSize: 13, fontWeight: '800', color: c.text },
    heroLanguage: { fontSize: 26, fontWeight: '800', color: c.onPrimary, marginBottom: 14 },
    heroProgressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    heroProgressLabel: { color: c.onPrimaryMuted, fontSize: 12, fontWeight: '600' },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
    },
    tile: {
      width: '48.5%',
      backgroundColor: c.card,
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
    tileValue: { fontSize: 24, fontWeight: '800', color: c.text },
    sectionSpacing: { marginTop: 24, marginBottom: 10 },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
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
    actionTitle: { fontSize: 15, fontWeight: '800', color: c.text, marginBottom: 2 },
  });

