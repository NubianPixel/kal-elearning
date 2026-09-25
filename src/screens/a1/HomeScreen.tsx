import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import { units } from '../../content';
import { nextAction, UNIT_STEPS, type UnitStatus, type UnitStep } from '../../core/path';
import {
  currentStreak,
  type ProgressDb,
} from '../../db/progress';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import ProgressBar from '../../components/ProgressBar';
import { loadPathData, firstIncompleteStepFromRow, REVIEW_CAP, type UnitRow } from './pathData';

interface Props {
  db: ProgressDb;
  /** Bump this to force Home to recompute (spec: recompute on focus/return). */
  refreshKey: number;
  onReview: () => void;
  onStep: (unit: number, step: UnitStep) => void;
  onCheckpoint: (unit: number | null) => void;
}

const STEP_LABEL: Record<UnitStep, string> = {
  words: 'Words',
  grammar: 'Grammar',
  useit: 'Use it',
  checkpoint: 'Checkpoint',
};

export default function HomeScreen({ db, refreshKey, onReview, onStep, onCheckpoint }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const [loading, setLoading] = useState(true);
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [dailyN, setDailyN] = useState(10);
  const [reviewedTodayCount, setReviewedTodayCount] = useState(0);
  const [introducedTodayCount, setIntroducedTodayCount] = useState(0);
  const [dueRawCount, setDueRawCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [action, setAction] = useState<ReturnType<typeof nextAction> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [data, streakDays] = await Promise.all([loadPathData(db), currentStreak(db)]);
      if (cancelled) return;
      setUnitRows(data.unitRows);
      setDailyN(data.dailyN);
      setReviewedTodayCount(data.reviewedTodayCount);
      setIntroducedTodayCount(data.introducedTodayCount);
      setDueRawCount(data.dueRawCount);
      setStreak(streakDays);
      setAction(nextAction(data.path));
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  if (loading || !action) {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const reviewGoalTotal = Math.min(reviewedTodayCount + dueRawCount, REVIEW_CAP);
  const reviewGoalPct = reviewGoalTotal > 0 ? (reviewedTodayCount / reviewGoalTotal) * 100 : 100;
  const newGoalPct = dailyN > 0 ? (Math.min(introducedTodayCount, dailyN) / dailyN) * 100 : 100;

  function pressContinue() {
    if (!action) return;
    if (action.kind === 'review') onReview();
    else if (action.kind === 'step') onStep(action.unit, action.step);
    else if (action.kind === 'exit-test') onCheckpoint(null);
  }

  const continueLabel =
    action.kind === 'review'
      ? `Review (${action.count})`
      : action.kind === 'step'
        ? `Continue · ${STEP_LABEL[action.step]}`
        : action.kind === 'exit-test'
          ? 'Start the A1 exit test'
          : null;

  const restMessage =
    action.kind === 'rest'
      ? action.reason === 'goal-met'
        ? 'Goal met for today — come back tomorrow!'
        : 'Catch up on reviews first.'
      : action.kind === 'done'
        ? "You've finished all available units — more coming soon."
        : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
      <View style={styles.headerStrip}>
        <View style={styles.headerPill}>
          <Ionicons name="flame" size={16} color={c.primaryDeep} />
          <Text style={styles.headerPillText}>{streak} day streak</Text>
        </View>
        <View style={styles.goalBlock}>
          <Text style={styles.goalLabel}>
            Reviews {reviewedTodayCount}/{reviewGoalTotal}
          </Text>
          <ProgressBar pct={reviewGoalPct} trackColor={c.primarySoft} fillColor={c.primary} />
        </View>
        <View style={styles.goalBlock}>
          <Text style={styles.goalLabel}>
            New words {Math.min(introducedTodayCount, dailyN)}/{dailyN}
          </Text>
          <ProgressBar pct={newGoalPct} trackColor={c.primarySoft} fillColor={c.accent} />
        </View>
      </View>

      {continueLabel ? (
        <Pressable style={[primaryButton, styles.continueButton]} onPress={pressContinue} accessibilityLabel={continueLabel}>
          <Ionicons name="play" size={26} color={c.onAccent} />
          <Text style={styles.continueText}>{continueLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.restCard}>
          <Ionicons name="cafe-outline" size={28} color={c.primaryDeep} />
          <Text style={styles.restText}>{restMessage}</Text>
        </View>
      )}

      <Text style={[t.sectionTitle, styles.mapTitle]}>Unit path</Text>

      {unitRows.map((row) => (
        <UnitRowView
          key={row.unit}
          row={row}
          onOpenStep={(step) => onStep(row.unit, step)}
          onTestOut={() => onCheckpoint(row.unit)}
        />
      ))}

      <View style={[styles.unitCard, styles.comingSoonCard]}>
        <Ionicons name="hourglass-outline" size={20} color={c.muted} />
        <Text style={styles.comingSoonText}>Coming soon</Text>
      </View>
    </ScrollView>
  );
}

function UnitRowView({
  row,
  onOpenStep,
  onTestOut,
}: {
  row: UnitRow;
  onOpenStep: (step: UnitStep) => void;
  onTestOut: () => void;
}) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const info = units.find((u) => u.unit === row.unit);
  const statusIcon: Record<UnitStatus, React.ComponentProps<typeof Ionicons>['name']> = {
    locked: 'lock-closed',
    unlocked: 'ellipse-outline',
    passed: 'checkmark-circle',
  };

  const rowPressable = row.status === 'unlocked';

  return (
    <View style={styles.unitCard}>
      <Pressable
        style={styles.unitHeader}
        disabled={!rowPressable}
        onPress={() => {
          const step = firstIncompleteStepFromRow(row);
          if (step) onOpenStep(step);
        }}
        accessibilityLabel={`Unit ${row.unit}: ${info?.titleSetswana ?? ''}`}
      >
        <Ionicons name={statusIcon[row.status]} size={20} color={row.status === 'passed' ? c.primary : c.muted} />
        <View style={styles.unitTitles}>
          <Text style={styles.unitTitle}>
            Unit {row.unit} · {info?.titleSetswana}
          </Text>
          <Text style={styles.unitSub}>{info?.canDo}</Text>
        </View>
      </Pressable>

      <View style={styles.stepRow}>
        {UNIT_STEPS.map((step) => {
          const done = row.steps[step];
          const interactive = row.status === 'passed';
          return (
            <Pressable
              key={step}
              style={[styles.stepChip, done && styles.stepChipDone]}
              disabled={!interactive}
              onPress={() => onOpenStep(step)}
              accessibilityLabel={`${STEP_LABEL[step]}${done ? ', done' : ''}`}
            >
              <Text style={[styles.stepChipText, done && styles.stepChipTextDone]}>{STEP_LABEL[step]}</Text>
            </Pressable>
          );
        })}
      </View>

      {row.status === 'locked' && (
        <>
          <Text style={styles.lockedHint}>Pass Unit {row.unit - 1}'s checkpoint to unlock</Text>
          <Pressable style={styles.testOutButton} onPress={onTestOut} accessibilityLabel={`Test out of Unit ${row.unit}`}>
            <Text style={styles.testOutText}>Test out</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
    headerStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 14,
      marginBottom: 16,
      ...cardShadow(c, 'sm'),
    },
    headerPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.accentSoft,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    headerPillText: { fontSize: 12, fontWeight: '800', color: c.primaryDeep },
    goalBlock: { flex: 1, gap: 4 },
    goalLabel: { fontSize: 11, fontWeight: '700', color: c.muted },
    continueButton: { backgroundColor: c.primary, flexDirection: 'row', gap: 10, minHeight: 68 },
    continueText: { fontSize: 20, fontWeight: '800', color: c.onPrimary },
    restCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.primarySoft,
      borderRadius: 22,
      padding: 18,
    },
    restText: { flex: 1, fontSize: 15, fontWeight: '700', color: c.primaryDeep },
    mapTitle: { marginTop: 24, marginBottom: 12 },
    unitCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      ...cardShadow(c, 'sm'),
    },
    unitHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    unitTitles: { flex: 1 },
    unitTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    unitSub: { fontSize: 12, fontWeight: '600', color: c.muted, marginTop: 1 },
    stepRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
    stepChip: {
      flex: 1,
      minHeight: 36,
      borderRadius: 10,
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepChipDone: { backgroundColor: c.primarySoft },
    stepChipText: { fontSize: 10, fontWeight: '800', color: c.muted },
    stepChipTextDone: { color: c.primaryDeep },
    testOutButton: {
      marginTop: 10,
      alignSelf: 'flex-start',
      backgroundColor: c.accentSoft,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 40,
      justifyContent: 'center',
    },
    testOutText: {
      fontSize: 13,
      fontWeight: '800',
      color: c.primaryDeep,
    },
    lockedHint: { marginTop: 10, fontSize: 12, fontWeight: '700', color: c.muted },
    comingSoonCard: { flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.6 },
    comingSoonText: { fontSize: 14, fontWeight: '700', color: c.muted },
  });
