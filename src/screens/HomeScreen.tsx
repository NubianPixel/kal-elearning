import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, makeTextStyles, useTheme, type ThemeColors } from '../theme';
import { TAB_BAR_SPACE } from '../components/TabBar';
import ProgressBar from '../components/ProgressBar';
import { dailyProgressPct } from '../core/goals';
import { leagueForXp } from '../core/gamification';
import type { ProgressStats } from '../core/types';

interface Props {
  languageName: string;
  onReview: () => void;
  onLearn: () => void;
  onRevise: () => void;
  onStory: () => void;
  onTyping: () => void;
  onParentZone: () => void;
  loadStats: () => Promise<ProgressStats>;
  loadGoal: () => Promise<number>;
  loadXp: () => Promise<number>;
}

function StatChip({
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
  return (
    <View style={styles.statChip}>
      <View style={[styles.statIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

function ActionTile({
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
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={[styles.tileIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={styles.tileTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.tileSubtitle} numberOfLines={1}>{subtitle}</Text>
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
    onRevise,
  onStory,
  onTyping,
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
      {/* Pinned daily challenge card — normal flex stacking, not absolute:
          its height is content-dependent, so faking this with position
          absolute + a hardcoded ScrollView paddingTop guaranteed drift
          between the two the moment content or safe-area insets changed. */}
      <View style={styles.hero}>
        {/* Streak + XP + League pills */}
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
        {/* One-line stat strip — everything at a glance, no scrolling */}
        <View style={styles.statStrip}>
          <StatChip icon="trophy" value={`${mastered}`} label="Mastered" tint={c.primary} soft={c.primarySoft} styles={styles} />
          <StatChip icon="flame" value={`${streak}`} label="Streak" tint={c.primaryDeep} soft={c.accentSoft} styles={styles} />
          <StatChip icon="stats-chart" value={accuracy} label="Accuracy" tint={c.primary} soft={c.primarySoft} styles={styles} />
          <StatChip
            icon={league.icon as React.ComponentProps<typeof Ionicons>['name']}
            value={league.name}
            label="League"
            tint={c.primaryDeep}
            soft={c.accentSoft}
            styles={styles}
          />
        </View>

        {/* 3x2 action grid — every activity reachable on one screen */}
        <Text style={[t.sectionTitle, styles.sectionSpacing]}>What should we do today?</Text>
        <View style={styles.grid}>
          <ActionTile icon="mic" tint={c.onAccent} soft={c.accent} title="Practice" subtitle="Daily words" onPress={onReview} styles={styles} />
          <ActionTile icon="school-outline" tint={c.primaryDeep} soft={c.accentSoft} title="Learn" subtitle="Cards & sounds" onPress={onLearn} styles={styles} />
          <ActionTile icon="albums-outline" tint={c.primaryDeep} soft={c.accentSoft} title="Revise" subtitle="Swipe cards" onPress={onRevise} styles={styles} />
          <ActionTile icon="book-outline" tint={c.primaryDeep} soft={c.primarySoft} title="Stories" subtitle="Listen along" onPress={onStory} styles={styles} />
          <ActionTile icon="create-outline" tint={c.onAccent} soft={c.accent} title="Type it" subtitle="Spell meaning" onPress={onTyping} styles={styles} />
          <ActionTile icon="lock-closed-outline" tint={c.primary} soft={c.primarySoft} title="Parent" subtitle="Settings" onPress={onParentZone} styles={styles} />
        </View>
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
      marginHorizontal: 20,
      marginTop: 8,
      marginBottom: 8,
      ...cardShadow(c, 'lg'),
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
    statStrip: {
      flexDirection: 'row',
      gap: 8,
    },
    statChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: c.card,
      borderRadius: 14,
      paddingHorizontal: 8,
      paddingVertical: 9,
      ...cardShadow(c, 'sm'),
    },
    statIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statTextWrap: { flex: 1 },
    statValue: { fontSize: 14, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 9, fontWeight: '600', color: c.muted, marginTop: 1 },
    sectionSpacing: { marginTop: 20, marginBottom: 10 },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
    },
    tile: {
      width: '32%',
      backgroundColor: c.card,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 6,
      alignItems: 'center',
      ...cardShadow(c, 'sm'),
    },
    tileIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    tileTitle: { fontSize: 12, fontWeight: '800', color: c.text },
    tileSubtitle: {
      fontSize: 9,
      fontWeight: '600',
      color: c.muted,
      marginTop: 2,
      textAlign: 'center',
    },
  });

