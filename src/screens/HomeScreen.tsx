import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, makeTextStyles, useTheme, type ThemeColors } from '../theme';
import { TAB_BAR_SPACE } from '../components/TabBar';
import ProgressBar from '../components/ProgressBar';
import { dailyProgressPct } from '../core/goals';
import { leagueForXp, leagueProgress } from '../core/gamification';
import { nextMilestone } from '../core/progress';
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

function StatCard({
  icon,
  value,
  label,
  bg,
  onBg,
  onBgFaint,
  width,
  styles,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
  bg: string;
  onBg: string;
  onBgFaint: string;
  width: number;
  styles: Record<string, object>;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg, width }]}>
      <View style={[styles.heroBadge, { backgroundColor: onBgFaint }]}>
        <Ionicons name={icon} size={12} color={onBg} />
        <Text style={[styles.heroBadgeText, { color: onBg }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.statValueBig, { color: onBg }]} numberOfLines={1}>
        {value}
      </Text>
      {children}
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
  const { width: screenW } = useWindowDimensions();
  const statCardWidth = Math.round(screenW * 0.62);
  const statCardStep = statCardWidth + 12;

  useEffect(() => {
    loadStats().then(setStats).catch(() => undefined);
    loadGoal().then(setGoal).catch(() => undefined);
    loadXp().then(setXp).catch(() => undefined);
  }, [loadStats, loadGoal, loadXp]);

  const streak = stats?.streakDays ?? 0;
  const mastered = stats?.mastered ?? 0;
  const accuracy = stats?.accuracy30d == null ? '—' : `${Math.round(stats.accuracy30d * 100)}%`;
  const league = leagueForXp(xp);
  const milestone = nextMilestone(mastered);
  const lg = leagueProgress(xp);

  return (
    <View style={styles.container}>
      {/* Pinned status pills — visible without scrolling */}
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
        {/* Swipeable carousel — the daily-practice card is card 1; every card
            shares the hero design language (badge, big value, own progress
            element) but sits on a different theme surface. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={statCardStep}
          decelerationRate="fast"
          contentContainerStyle={styles.statCarousel}
        >
          {/* Card 1 — Daily practice (the former pinned hero) */}
          <View style={[styles.statCard, { backgroundColor: c.primary, width: statCardWidth }]}>
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

          {/* Card 2 — Words mastered, with milestone progress */}
          <StatCard
            icon="trophy"
            value={`${mastered}`}
            label="Words mastered"
            bg={c.primaryDark}
            onBg={c.onPrimary}
            onBgFaint={c.onPrimaryFaint}
            width={statCardWidth}
            styles={styles}
          >
            {milestone ? (
              <>
                <View style={styles.heroProgressRow}>
                  <Text style={[styles.heroProgressLabel, { color: c.onPrimary }]}>
                    {milestone.label}
                  </Text>
                  <Text style={[styles.heroProgressLabel, { color: c.onPrimary }]}>
                    {mastered} of {milestone.target}
                  </Text>
                </View>
                <ProgressBar
                  pct={Math.min(1, mastered / milestone.target)}
                  trackColor={c.onPrimaryFaint}
                  fillColor={c.onPrimary}
                  height={7}
                />
              </>
            ) : (
              <Text style={[styles.statCaption, { color: c.onPrimary }]}>
                Every milestone reached!
              </Text>
            )}
          </StatCard>

          {/* Card 3 — Day streak, with a 7-day dot row */}
          <StatCard
            icon="flame"
            value={`${streak}`}
            label="Day streak"
            bg={c.accent}
            onBg={c.onAccent}
            onBgFaint={c.onPrimaryFaint}
            width={statCardWidth}
            styles={styles}
          >
            <View style={styles.streakDots}>
              {Array.from({ length: 7 }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.streakDot,
                    { backgroundColor: i < Math.min(streak, 7) ? c.onAccent : c.onPrimaryFaint },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.statCaption, { color: c.onAccent }]}>
              days in a row — keep it going!
            </Text>
          </StatCard>

          {/* Card 4 — 30-day accuracy, with its own progress bar */}
          <StatCard
            icon="stats-chart"
            value={accuracy}
            label="30-day accuracy"
            bg={c.dark}
            onBg={c.onDark}
            onBgFaint="rgba(255,255,255,0.18)"
            width={statCardWidth}
            styles={styles}
          >
            <ProgressBar
              pct={stats?.accuracy30d ?? 0}
              trackColor="rgba(255,255,255,0.18)"
              fillColor={c.onDark}
              height={7}
            />
            <Text style={[styles.statCaption, { color: c.onDark }]}>of answers correct</Text>
          </StatCard>

          {/* Card 5 — Current league, with XP progress to the next one */}
          <StatCard
            icon={league.icon as React.ComponentProps<typeof Ionicons>['name']}
            value={league.name}
            label="Current league"
            bg={c.primary}
            onBg={c.onPrimary}
            onBgFaint={c.onPrimaryFaint}
            width={statCardWidth}
            styles={styles}
          >
            <ProgressBar
              pct={lg.pct}
              trackColor={c.onPrimaryFaint}
              fillColor={c.onPrimary}
              height={7}
            />
            <Text style={[styles.statCaption, { color: c.onPrimary }]}>
              {lg.next ? `${lg.nextGap} XP to ${lg.next.name}` : 'Top league reached!'}
            </Text>
          </StatCard>
        </ScrollView>

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
      paddingHorizontal: 20,
      marginTop: 4,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
    leaguePill: { backgroundColor: c.accent },
    streakText: { fontSize: 15, fontWeight: '800', color: c.text },
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
    statCarousel: {
      paddingHorizontal: 20,
      gap: 12,
      paddingRight: 40,
    },
    statCard: {
      borderRadius: 24,
      padding: 18,
      justifyContent: 'space-between',
      ...cardShadow(c, 'lg'),
    },
    statValueBig: { fontSize: 28, fontWeight: '800', marginTop: 14 },
    statCaption: { fontSize: 12, fontWeight: '600', marginTop: 6 },
    streakDots: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 14,
    },
    streakDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
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

