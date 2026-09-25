import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Share, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { cardShadow, makeTextStyles, primaryButton, useTheme, type ThemeColors } from '../../theme';
import { units, A1_UNIT_COUNT } from '../../content';
import { currentUnitNumber } from '../../core/path';
import {
  progressSummary,
  currentStreak,
  unitCheckpointBadges,
  practicedSpeakingCount,
  passedUnits,
  exitTestPassed,
  setDailyN,
  DAILY_N_OPTIONS,
  exportProgress,
  importProgress,
  type UnitCheckpointBadge,
  type ProgressDb,
} from '../../db/progress';
import { loadPathData } from './pathData';
import { TAB_BAR_SPACE } from '../../components/TabBar';

interface Props {
  db: ProgressDb;
}

interface Summary {
  headline: string;
  wordsMastered: number;
  streak: number;
  goalMetToday: boolean;
  dailyN: number;
  badges: UnitCheckpointBadge[];
  speakingCount: number;
}

async function loadSummary(db: ProgressDb): Promise<Summary> {
  const [summary, streak, badges, speakingCount, passed, exitPassed, path] = await Promise.all([
    progressSummary(db),
    currentStreak(db),
    unitCheckpointBadges(db),
    practicedSpeakingCount(db),
    passedUnits(db),
    exitTestPassed(db),
    loadPathData(db),
  ]);
  const cur = currentUnitNumber(passed, units.length);
  const headline = exitPassed ? 'A1 complete' : `A1 · Unit ${cur ?? units.length} of ${A1_UNIT_COUNT}`;
  return {
    headline,
    wordsMastered: summary.wordsMastered,
    streak,
    goalMetToday: path.path.goalMetToday,
    dailyN: path.dailyN,
    badges,
    speakingCount,
  };
}

/** Progress tab: headline stats, checkpoint badges, daily-goal setting,
 *  and JSON export/import (never audio — see design doc's privacy rules). */
export default function ProgressScreen({ db }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const t = useMemo(() => makeTextStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const safeEdges = { paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_SPACE };

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [importText, setImportText] = useState('');
  const [importConfirming, setImportConfirming] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    loadSummary(db)
      .then((s) => {
        setSummary(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function changeDailyN(n: number) {
    await setDailyN(db, n);
    refresh();
  }

  async function doExport() {
    const data = await exportProgress(db);
    const message = JSON.stringify(data, null, 2);
    try {
      await Share.share({ message });
    } catch {
      // User cancelled or share failed — nothing to recover from here.
    }
  }

  async function doImport() {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError('That doesn’t look like valid JSON.');
      return;
    }
    try {
      await importProgress(db, parsed);
      setImportConfirming(false);
      setImportText('');
      setImportDone(true);
      refresh();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not import that file.');
    }
  }

  if (loading || !summary) {
    return (
      <View style={[styles.center, safeEdges]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, safeEdges]}>
      <View style={styles.headlineCard}>
        <Text style={styles.headline}>{summary.headline}</Text>
        <View style={styles.statsRow}>
          <Stat label="Words mastered" value={String(summary.wordsMastered)} />
          <Stat label="Day streak" value={String(summary.streak)} />
          <Stat label="Practised saying" value={String(summary.speakingCount)} />
        </View>
        <View style={styles.goalRow}>
          <Ionicons name={summary.goalMetToday ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={summary.goalMetToday ? c.primary : c.muted} />
          <Text style={styles.goalText}>{summary.goalMetToday ? "Today's goal met" : "Today's goal not met yet"}</Text>
        </View>
      </View>

      <Text style={[t.sectionTitle, styles.sectionSpacing]}>Checkpoints</Text>
      {summary.badges.map((b) => (
        <View key={b.unit} style={styles.badgeRow}>
          <Ionicons name={b.passed ? 'trophy' : b.attempted ? 'ellipse-outline' : 'lock-closed-outline'} size={18} color={b.passed ? c.primary : c.muted} />
          <Text style={styles.badgeText}>Unit {b.unit}</Text>
          <Text style={styles.badgeScore}>{b.bestPct != null ? `${b.bestPct}%` : '—'}</Text>
        </View>
      ))}

      <Text style={[t.sectionTitle, styles.sectionSpacing]}>Daily new words</Text>
      <View style={styles.segmentRow}>
        {DAILY_N_OPTIONS.map((n) => (
          <Pressable
            key={n}
            style={[styles.segment, summary.dailyN === n && styles.segmentActive]}
            onPress={() => changeDailyN(n)}
            accessibilityLabel={`${n} new words a day`}
          >
            <Text style={[styles.segmentText, summary.dailyN === n && styles.segmentTextActive]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[t.sectionTitle, styles.sectionSpacing]}>Backup</Text>
      <Pressable style={[primaryButton, styles.exportButton]} onPress={doExport} accessibilityLabel="Export progress">
        <Ionicons name="share-outline" size={18} color={c.onPrimary} />
        <Text style={styles.exportText}>Export progress</Text>
      </Pressable>

      <Text style={[t.sectionTitle, styles.sectionSpacing]}>Restore progress</Text>
      <Text style={t.mutedText}>Paste an exported progress JSON below. This replaces everything currently on this device.</Text>
      <TextInput
        style={styles.importInput}
        value={importText}
        onChangeText={(v) => {
          setImportText(v);
          setImportDone(false);
          setImportError(null);
        }}
        multiline
        placeholder="Paste exported JSON here"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Paste progress JSON to restore"
      />
      {importError ? <Text style={styles.errorText}>{importError}</Text> : null}
      {importDone ? <Text style={styles.successText}>Progress restored.</Text> : null}

      {!importConfirming ? (
        <Pressable
          style={[primaryButton, styles.restoreButton, !importText.trim() && styles.restoreButtonDisabled]}
          onPress={() => importText.trim() && setImportConfirming(true)}
          disabled={!importText.trim()}
          accessibilityLabel="Restore progress"
        >
          <Text style={styles.restoreText}>Restore progress</Text>
        </Pressable>
      ) : (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>This replaces all current progress on this device and can’t be undone. Continue?</Text>
          <View style={styles.confirmRow}>
            <Pressable style={[primaryButton, styles.confirmCancel]} onPress={() => setImportConfirming(false)} accessibilityLabel="Cancel restore">
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[primaryButton, styles.confirmGo]} onPress={doImport} accessibilityLabel="Confirm restore progress">
              <Text style={styles.confirmGoText}>Yes, replace it</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={[t.sectionTitle, styles.sectionSpacing]}>About</Text>
      <Text style={t.mutedText}>Content lovingly written and recorded by the author's family.</Text>
      <Text style={[t.mutedText, styles.versionText]}>KAL e-Learning v{appVersion}</Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20 },
    center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
    headlineCard: { backgroundColor: c.card, borderRadius: 22, padding: 18, ...cardShadow(c, 'md') },
    headline: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 12 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    stat: { alignItems: 'center', flex: 1 },
    statValue: { fontSize: 22, fontWeight: '800', color: c.primaryDeep },
    statLabel: { fontSize: 11, fontWeight: '700', color: c.muted, marginTop: 2, textAlign: 'center' },
    goalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    goalText: { fontSize: 13, fontWeight: '700', color: c.text },
    sectionSpacing: { marginTop: 24, marginBottom: 10 },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      minHeight: 44,
    },
    badgeText: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
    badgeScore: { fontSize: 13, fontWeight: '800', color: c.muted },
    segmentRow: { flexDirection: 'row', gap: 8, backgroundColor: c.card, borderRadius: 16, padding: 6, ...cardShadow(c, 'sm') },
    segment: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { fontSize: 15, fontWeight: '800', color: c.muted },
    segmentTextActive: { color: c.onPrimary },
    exportButton: { backgroundColor: c.primary, flexDirection: 'row', gap: 8 },
    exportText: { fontSize: 15, fontWeight: '800', color: c.onPrimary },
    importInput: {
      marginTop: 10,
      minHeight: 100,
      borderWidth: 2,
      borderColor: c.border,
      borderRadius: 16,
      padding: 14,
      fontSize: 13,
      color: c.text,
      backgroundColor: c.card,
      textAlignVertical: 'top',
    },
    errorText: { fontSize: 13, fontWeight: '700', color: c.wrong, marginTop: 8 },
    successText: { fontSize: 13, fontWeight: '700', color: c.primary, marginTop: 8 },
    restoreButton: { backgroundColor: c.accent, marginTop: 12 },
    restoreButtonDisabled: { opacity: 0.5 },
    restoreText: { fontSize: 15, fontWeight: '800', color: c.onAccent },
    confirmBox: { marginTop: 12, backgroundColor: c.wrongSoft, borderRadius: 16, padding: 14 },
    confirmText: { fontSize: 13, fontWeight: '700', color: c.text },
    confirmRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    confirmCancel: { flex: 1, backgroundColor: c.card, marginVertical: 0 },
    confirmCancelText: { fontSize: 14, fontWeight: '800', color: c.text },
    confirmGo: { flex: 1, backgroundColor: c.danger, marginVertical: 0 },
    confirmGoText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
    versionText: { marginTop: 8 },
  });
