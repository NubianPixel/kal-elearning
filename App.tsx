import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type * as SQLite from 'expo-sqlite';
import { getProgressDb } from './src/db/progress';
import { sweepLeftoverRecordings } from './src/audio';
import type { UnitStep } from './src/core/path';
import HomeScreen from './src/screens/a1/HomeScreen';
import ReviewScreen from './src/screens/a1/ReviewScreen';
import WordsStep from './src/screens/a1/WordsStep';
import GrammarStep from './src/screens/a1/GrammarStep';
import UseItStep from './src/screens/a1/UseItStep';
import CheckpointScreen from './src/screens/a1/CheckpointScreen';
import PracticeScreen from './src/screens/a1/PracticeScreen';
import LibraryScreen from './src/screens/a1/LibraryScreen';
import ProgressScreen from './src/screens/a1/ProgressScreen';
import TabBar, { type TabKey } from './src/components/TabBar';
import AppHeader from './src/components/AppHeader';
import SplashScreen from './src/components/SplashScreen';
import { ThemeProvider, useTheme } from './src/theme';

type StackScreen =
  | { kind: 'review' }
  | { kind: 'step'; unit: number; step: UnitStep }
  | { kind: 'checkpoint'; unit: number | null };

const STEP_TITLE: Record<UnitStep, string> = {
  words: 'Words',
  grammar: 'Grammar',
  useit: 'Use it',
  checkpoint: 'Checkpoint',
};

/**
 * App shell. State-based navigation (no navigation library): a persistent
 * bottom tab bar (Home / Practice / Library / Progress) plus an optional
 * "stacked" screen (review session, a unit step, a checkpoint) that
 * temporarily replaces the active tab's content and wires AppHeader's
 * back button to pop back to Home.
 *
 * Privacy: no accounts, no analytics, no trackers — everything is local.
 * Speaking recordings are temp files; sweep any left behind by a crash or
 * force-quit as soon as the app starts (see src/audio.ts).
 */
export default function App() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

  useEffect(() => {
    sweepLeftoverRecordings();
    getProgressDb()
      .then(setDb)
      .catch((e) => console.error('Failed to open progress database', e));
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Shell db={db} />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function Shell({ db }: { db: SQLite.SQLiteDatabase | null }) {
  const { colors: c } = useTheme();
  const [splash, setSplash] = useState(true);
  const hideSplash = useCallback(() => setSplash(false), []);

  const [tab, setTab] = useState<TabKey>('home');
  const [stack, setStack] = useState<StackScreen | null>(null);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);

  /** Pop any stacked screen, land back on Home, and force it to recompute. */
  const finishStack = useCallback(() => {
    setStack(null);
    setTab('home');
    setHomeRefreshKey((k) => k + 1);
  }, []);

  const selectTab = useCallback((next: TabKey) => {
    setStack(null);
    setTab(next);
    if (next === 'home') setHomeRefreshKey((k) => k + 1);
  }, []);

  const header = useMemo(() => {
    if (stack) {
      if (stack.kind === 'review') return { title: 'Review' };
      if (stack.kind === 'checkpoint') {
        return { title: stack.unit === null ? 'A1 Exit Test' : `Unit ${stack.unit} Checkpoint` };
      }
      const label = stack.step === 'checkpoint' ? `Unit ${stack.unit} Checkpoint` : `Unit ${stack.unit} · ${STEP_TITLE[stack.step]}`;
      return { title: label };
    }
    switch (tab) {
      case 'home':
        return { title: 'Dumela!', subtitle: "Let's learn Setswana", display: true };
      case 'practice':
        return { title: 'Practice' };
      case 'library':
        return { title: 'Library' };
      case 'progress':
        return { title: 'Progress' };
    }
  }, [stack, tab]);

  if (!db) {
    // Splash doubles as the loading screen while the database opens.
    if (splash) return <SplashScreen onDone={hideSplash} />;
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar style={c.statusBar} />
      <AppHeader
        title={header.title}
        subtitle={'subtitle' in header ? header.subtitle : undefined}
        titleVariant={'display' in header && header.display ? 'display' : 'default'}
        onBack={stack ? finishStack : undefined}
      />

      <View style={styles.body}>
        {stack === null && tab === 'home' && (
          <HomeScreen
            db={db}
            refreshKey={homeRefreshKey}
            onReview={() => setStack({ kind: 'review' })}
            onStep={(unit, step) => setStack({ kind: 'step', unit, step })}
            onCheckpoint={(unit) => setStack({ kind: 'checkpoint', unit })}
          />
        )}
        {stack === null && tab === 'practice' && <PracticeScreen db={db} />}
        {stack === null && tab === 'library' && <LibraryScreen db={db} />}
        {stack === null && tab === 'progress' && <ProgressScreen db={db} />}

        {stack?.kind === 'review' && <ReviewScreen db={db} onFinish={finishStack} />}
        {stack?.kind === 'checkpoint' && <CheckpointScreen db={db} unit={stack.unit} onDone={finishStack} />}
        {stack?.kind === 'step' && stack.step === 'words' && <WordsStep db={db} unit={stack.unit} onDone={finishStack} />}
        {stack?.kind === 'step' && stack.step === 'grammar' && <GrammarStep db={db} unit={stack.unit} onDone={finishStack} />}
        {stack?.kind === 'step' && stack.step === 'useit' && <UseItStep db={db} unit={stack.unit} onDone={finishStack} />}
        {stack?.kind === 'step' && stack.step === 'checkpoint' && (
          <CheckpointScreen db={db} unit={stack.unit} onDone={finishStack} />
        )}
      </View>

      <TabBar active={tab} onSelect={selectTab} />

      {splash && <SplashScreen onDone={hideSplash} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
