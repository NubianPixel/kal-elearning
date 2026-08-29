import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import type * as SQLite from 'expo-sqlite';
import { makeTextStyles, THEMES, THEME_LABELS, THEME_ORDER, useTheme, type ThemeColors, type ThemeName } from '../theme';
import { TAB_BAR_SPACE } from '../components/TabBar';
import ProgressBar from '../components/ProgressBar';
import { DAILY_GOAL_OPTIONS } from '../core/goals';
import { nextMilestone } from '../core/progress';
import {
  BIOMETRIC_KEY,
  DEFAULT_DAILY_GOAL,
  DEFAULT_DIFFICULTY,
  getDailyGoal,
  getDifficulty,
  getProgressStats,
  getSetting,
  getWeeklyActivity,
  getXp,
  setDailyGoal,
  setDifficulty,
  setSetting,
  type DayActivity,
  type DifficultySetting,
} from '../db/repositories';
import { leagueForXp, leagueProgress } from '../core/gamification';
import type { ProgressStats } from '../core/types';

interface Props {
  db: SQLite.SQLiteDatabase;
  languageId: number;
  languageName: string;
  onExit: () => void;
  onManageContent: () => void;
}

type Section = 'overview' | 'security' | 'difficulty' | 'theme' | 'goal';

const DIFFICULTY_LABELS: Record<DifficultySetting, string> = {
  easy: 'Easy (3 options)',
  medium: 'Medium (4 options)',
  hard: 'Hard (4 options, tougher words)',
};

const DAILY_GOAL_LABELS: Record<number, string> = {
  3: '3 words',
  5: '5 words',
  10: '10 words',
};

/**
 * DashboardScreen — the "Parent Zone" settings/configure page.
 *
 * Design goals:
 * - Looks and feels like a settings/config screen (grouped sections,
 *   chevron navigation, switches), NOT like a child activity screen.
 * - Biometric lock toggle: gates the entire Parent Zone behind Face ID /
 *   fingerprint. Requires hardware + enrolled biometrics.
 * - Difficulty selector: parent chooses the review card challenge level
 *   for the child (easy / medium / hard).
 * - Theme selector: parent picks the kid-friendly palette.
 * - Daily goal selector: how many words per day.
 * - Progress overview: streak, XP, league, mastered count, weekly heatbar.
 *
 * The bottom tab bar and top AppHeader are always visible (managed at
 * the App.tsx shell level), so this screen feels like a cohesive part
 * of the app — never like leaving it.
 */
export default function DashboardScreen({ db, languageId, languageName, onExit, onManageContent }: Props) {
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [xp, setXp] = useState(0);
  const [weekly, setWeekly] = useState<DayActivity[]>([]);
  const [difficulty, setDifficultyState] = useState<DifficultySetting>(DEFAULT_DIFFICULTY);
  const [dailyGoal, setDailyGoalState] = useState(DEFAULT_DAILY_GOAL);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockAvailable, setLockAvailable] = useState(false);
  const [loadingSetting, setLoadingSetting] = useState(false);

  const { colors: c, name: themeName, setTheme } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, x, w, d, g, lockState, hw] = await Promise.all([
        getProgressStats(db, languageId),
        getXp(db),
        getWeeklyActivity(db, languageId),
        getDifficulty(db),
        getDailyGoal(db),
        getSetting(db, BIOMETRIC_KEY),
        (async () => {
          const hasHW = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          return hasHW && enrolled;
        })(),
      ]);
      setStats(s);
      setXp(x);
      setWeekly(w);
      setDifficultyState(d);
      setDailyGoalState(g);
      setLockEnabled(lockState === '1');
      setLockAvailable(hw);
    } catch {
      // Non-fatal — show defaults.
    } finally {
      setLoading(false);
    }
    }, [db, languageId]);

  useEffect(() => {
    loadAll().catch(() => undefined);
  }, [loadAll]);

  const updateDifficulty = useCallback(
    async (value: DifficultySetting) => {
      setLoadingSetting(true);
      try {
        await setDifficulty(db, value);
        setDifficultyState(value);
      } finally {
        setLoadingSetting(false);
      }
    },
    [db],
  );

  const updateGoal = useCallback(
    async (value: number) => {
      setLoadingSetting(true);
      try {
        await setDailyGoal(db, value);
        setDailyGoalState(value);
      } finally {
        setLoadingSetting(false);
      }
    },
    [db],
  );

  const updateTheme = useCallback(
    (value: ThemeName) => {
      setTheme(value);
    },
    [setTheme],
  );

  const toggleLock = useCallback(async () => {
    if (!lockAvailable) return;
    setLoadingSetting(true);
    try {
      const next = !lockEnabled;
      await setSetting(db, BIOMETRIC_KEY, next ? '1' : '0');
      setLockEnabled(next);
    } finally {
      setLoadingSetting(false);
    }
    }, [db, lockEnabled, lockAvailable]);

  const league = leagueForXp(xp);
  const leagueInfo = leagueProgress(xp);
  const milestone = nextMilestone(stats?.mastered ?? 0);
  const masteredCount = stats?.mastered ?? 0;
  const streak = stats?.streakDays ?? 0;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background, paddingBottom: insets.bottom + TAB_BAR_SPACE }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const safePadding = {
    paddingTop: 8,
    paddingBottom: insets.bottom + TAB_BAR_SPACE,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, safePadding]}
      scrollIndicatorInsets={{ bottom: safePadding.paddingBottom, left: 0, right: 0 }}
    >
      {/* ---- Section: Overview / Progress Summary ---- */}
      {section === 'overview' && (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={t.sectionTitle}>Progress</Text>
            </View>
            <View style={styles.progressGrid}>
              <View style={[styles.progressTile, { backgroundColor: c.primarySoft }]}>
                <Ionicons name="star" size={24} color={c.primaryDeep} />
                <Text style={styles.progressTileValue}>{xp}</Text>
                <Text style={styles.progressTileLabel}>XP</Text>
              </View>
              <View style={[styles.progressTile, { backgroundColor: c.accentSoft }]}>
                <Ionicons name="flame" size={24} color={c.primary} />
                <Text style={styles.progressTileValue}>{streak}</Text>
                <Text style={styles.progressTileLabel}>Day Streak</Text>
              </View>
              <View style={[styles.progressTile, { backgroundColor: c.primarySoft }]}>
                <Ionicons name="trophy" size={24} color={c.primaryDeep} />
                <Text style={styles.progressTileValue}>{masteredCount}</Text>
                <Text style={styles.progressTileLabel}>Words Mastered</Text>
              </View>
                        </View>
          </View>

          {/* League card */}
          <View style={[styles.card, { backgroundColor: league.color, marginBottom: 16 }]}>
            <View style={styles.leagueRow}>
              <Ionicons name={league.icon as React.ComponentProps<typeof Ionicons>['name']} size={24} color="white" />
              <Text style={[styles.leagueName, { color: c.onAccent }]}>{league.name} League</Text>
              <View style={[styles.leaguePill, { backgroundColor: c.onPrimaryFaint }]}>
                <Text style={[styles.leaguePillText, { color: c.onAccent }]}>{xp} XP</Text>
              </View>
            </View>
            {leagueInfo.next ? (
              <>
                <Text style={[styles.mutedLabel, { color: c.onPrimaryMuted }]}>
                  {leagueInfo.nextGap} XP to {leagueInfo.next.name}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <ProgressBar
                    pct={leagueInfo.pct * 100}
                    trackColor="rgba(255,255,255,0.3)"
                    fillColor={c.onAccent}
                    height={6}
                  />
                </View>
              </>
            ) : (
              <Text style={[styles.mutedLabel, { color: c.onPrimaryMuted }]}>Top league reached!</Text>
            )}
          </View>

          {/* Milestone hint */}
          {milestone ? (
            <View style={[styles.card, { paddingVertical: 12, alignItems: 'center', gap: 6 }]}>
              <Ionicons
                name={milestone.icon as React.ComponentProps<typeof Ionicons>['name']}
                size={28}
                color={c.primary}
              />
              <Text style={styles.milestoneText}>
                {milestone.target - masteredCount} more to unlock "{milestone.label}"
              </Text>
            </View>
          ) : null}

                    {/* Weekly activity heatbar */}
          <View style={styles.card}>
            <Text style={t.sectionTitle}>Last 7 days</Text>
            <View style={styles.heatbar}>
              {weekly.map((day) => {
                const intensity = Math.min(1, day.count / 5);
                const bg =
                  intensity === 0 ? c.card : `rgba(0, 0, 0, ${0.08 + intensity * 0.22})`;
                return (
                  <View key={day.label} style={styles.heatbarDay}>
                    <View
                      style={[
                        styles.heatbarBar,
                        { backgroundColor: day.isToday ? c.accent : bg, opacity: 0.7 + intensity * 0.3 },
                      ]}
                    >
                      {day.count > 0 ? (
                        <Text style={[styles.heatbarText, { color: c.onDark }]}>{day.count}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.heatbarLabel, { color: c.muted }]}>{day.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ---- Settings shortcuts ---- */}
          <View style={styles.sectionHeader}>
            <Text style={t.sectionTitle}>Settings</Text>
          </View>

          <SettingRow
            icon="shield-checkmark-outline"
            tint={c.primary}
            soft={c.primarySoft}
            title="Security & lock"
            subtitle={lockEnabled ? 'Biometric lock on' : 'Protect the Parent Zone'}
            onPress={() => setSection('security')}
            colors={c}
          />
          <SettingRow
            icon="school-outline"
            tint={c.primary}
            soft={c.accentSoft}
            title="Difficulty"
            subtitle={DIFFICULTY_LABELS[difficulty]}
            onPress={() => setSection('difficulty')}
            colors={c}
          />
          <SettingRow
            icon="eyedrop-outline"
            tint={c.primary}
            soft={c.primarySoft}
            title="Theme"
            subtitle={THEME_LABELS[themeName]}
            onPress={() => setSection('theme')}
            colors={c}
          />
          <SettingRow
            icon="calendar-outline"
            tint={c.primary}
            soft={c.accentSoft}
            title="Daily goal"
            subtitle={DAILY_GOAL_LABELS[dailyGoal]}
            onPress={() => setSection('goal')}
            colors={c}
          />
          <SettingRow
            icon="folder-open-outline"
            tint={c.primary}
            soft={c.primarySoft}
            title="Manage words & audio"
            subtitle="Add, record and edit vocabulary"
            onPress={onManageContent}
            colors={c}
          />

          <Pressable onPress={onExit} style={styles.homeLink}>
            <Ionicons name="home-outline" size={16} color={c.muted} />
            <Text style={styles.homeLinkText}>Back to Home</Text>
          </Pressable>
        </>
      )}

      {/* ---- Section: Security ---- */}
      {section === 'security' && (
        <SettingPage
          title="Security"
          subtitle="Protect the Parent Zone with biometrics"
          onBack={() => setSection('overview')}
          colors={c}
        >
          <View style={styles.settingGroup}>
            <View style={styles.settingRow}>
              <Ionicons name="finger-print" size={22} color={c.primaryDeep} style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingRowTitle}>Biometric lock</Text>
                <Text style={[t.mutedText, { marginTop: 2 }]}>
                  {lockAvailable
                    ? 'Uses Face ID / fingerprint to open this section'
                    : 'No biometrics enrolled on this device'}
                </Text>
              </View>
              <View style={styles.toggleWrap}>
                <Switch
                  value={lockEnabled}
                  onValueChange={toggleLock}
                  disabled={loadingSetting || !lockAvailable}
                  colors={c}
                />
              </View>
            </View>
          </View>
        </SettingPage>
      )}

      {/* ---- Section: Difficulty ---- */}
      {section === 'difficulty' && (
        <SettingPage
          title="Difficulty"
          subtitle="How hard are the review cards?"
          onBack={() => setSection('overview')}
          colors={c}
        >
          <RadioGroup<DifficultySetting>
            options={['easy', 'medium', 'hard']}
            labels={DIFFICULTY_LABELS}
            value={difficulty}
            onChange={updateDifficulty}
            disabled={loadingSetting}
            colors={c}
          />
        </SettingPage>
      )}

      {/* ---- Section: Theme ---- */}
      {section === 'theme' && (
        <SettingPage
          title="Theme"
          subtitle="Kid-friendly color palette"
          onBack={() => setSection('overview')}
          colors={c}
        >
                    <RadioGroup<ThemeName>
            options={[...THEME_ORDER]}
            labels={THEME_LABELS}
            value={themeName}
            onChange={updateTheme}
            disabled={loadingSetting}
            colors={c}
            renderOption={(opt) => (
              <View style={styles.themeOption}>
                <View style={[styles.themeSwatch, { backgroundColor: THEMES[opt].accent }]} />
              </View>
            )}
          />
        </SettingPage>
      )}

      {/* ---- Section: Daily Goal ---- */}
      {section === 'goal' && (
        <SettingPage
          title="Daily goal"
          subtitle="New words introduced each day"
          onBack={() => setSection('overview')}
          colors={c}
        >
          <RadioGroup<number>
                        options={[...DAILY_GOAL_OPTIONS]}
            labels={DAILY_GOAL_LABELS}
            value={dailyGoal}
            onChange={updateGoal}
            disabled={loadingSetting}
            colors={c}
          />
        </SettingPage>
      )}
    </ScrollView>
  );
}


/** A single labeled setting row with a chevron. */
function SettingRow({
  icon,
  tint,
  soft,
  title,
  subtitle,
  onPress,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  soft: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable style={[styles.settingRow, { backgroundColor: colors.card }]} onPress={onPress}>
      <View style={[styles.settingIconWrap, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingRowTitle}>{title}</Text>
        <Text style={[styles.settingRowSubtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

/** A sub-page wrapper: pinned back chevron + header, then children. */
function SettingPage({
  title,
  subtitle,
  onBack,
  colors,
  children,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  colors: ThemeColors;
  children: React.ReactNode;
}) {
  const t = useMemo(() => makeTextStyles(colors), [colors]);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <>
      <View style={styles.settingPageHeader}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={10} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.primaryDeep} />
        </Pressable>
        <View>
          <Text style={[t.sectionTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[t.mutedText, { marginTop: 2 }]}>{subtitle}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </>
  );
}

/** A simple radio-style group: tapping a row selects it. */
function RadioGroup<T extends string | number>({
  options,
  labels,
  value,
  onChange,
  disabled,
  colors,
  renderOption,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
  disabled: boolean;
  colors: ThemeColors;
  renderOption?: (opt: T) => React.ReactNode;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.radioGroup}>
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <Pressable
            key={String(opt)}
            style={[
              styles.radioRow,
              { backgroundColor: colors.card, borderColor: selected ? colors.accent : colors.border },
            ]}
            onPress={() => onChange(opt)}
            disabled={disabled}
          >
            <View style={styles.radioLeft}>
              {renderOption ? (
                renderOption(opt)
              ) : (
                                  <Ionicons
                  name={selected ? 'ellipse' : 'ellipse-outline'}
                  size={24}
                  color={selected ? colors.accent : colors.muted}
                />
              )}
              <Text style={[styles.radioLabel, { color: colors.text }]}>{labels[opt]}</Text>
            </View>
            {selected && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                    </Pressable>
        );
      })}
    </View>
  );
}

/** Minimal on/off switch component (no native deps). */
function Switch({
  value,
  onValueChange,
  disabled,
  colors,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled: boolean;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      style={[
        styles.switch,
        { backgroundColor: value ? colors.accent : colors.card, opacity: disabled ? 0.5 : 1 },
      ]}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityLabel="Toggle biometric lock"
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <View
        style={[
          styles.switchKnob,
          value && styles.switchKnobOn,
          { backgroundColor: colors.onAccent },
        ]}
      />
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
    StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 48 },
    center: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 22,
      padding: 18,
      marginBottom: 16,
      shadowColor: c.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    progressGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    progressTile: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 4,
    },
    progressTileValue: { fontSize: 22, fontWeight: '800', color: c.text },
    progressTileLabel: { fontSize: 11, fontWeight: '700', color: c.muted },
    leagueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    leagueName: { fontSize: 16, fontWeight: '800', flex: 1 },
    leaguePill: {
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    leaguePillText: { fontSize: 12, fontWeight: '800' },
    mutedLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
    milestoneText: { fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'center' },
    heatbar: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
    heatbarDay: { alignItems: 'center', flex: 1 },
    heatbarBar: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
    },
    heatbarText: { fontSize: 10, fontWeight: '800' },
    heatbarLabel: { fontSize: 11, fontWeight: '600', marginTop: 4 },
    sectionHeader: { marginTop: 8, marginBottom: 8 },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      shadowColor: c.shadow,
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    settingIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingIcon: { marginRight: 4 },
    settingText: { flex: 1 },
    settingRowTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    settingRowSubtitle: { fontSize: 12, fontWeight: '500' },
    settingGroup: { gap: 12, marginTop: 8 },
    toggleWrap: { paddingLeft: 12 },
    settingPageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 20,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioGroup: { gap: 10 },
    radioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 16,
      padding: 14,
      borderWidth: 2,
    },
    radioLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    radioLabel: { fontSize: 15, fontWeight: '600' },
    themeOption: { padding: 4 },
    themeSwatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: c.border },
    switch: {
      width: 44,
      height: 26,
      borderRadius: 13,
      padding: 2,
    },
    switchKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.muted,
    },
    switchKnobOn: { alignSelf: 'flex-end' },
    homeLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center',
      marginTop: 12,
      padding: 10,
    },
    homeLinkText: { color: c.muted, fontSize: 14, fontWeight: '600' },
  });






