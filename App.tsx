import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import type * as SQLite from 'expo-sqlite';
import { getDb } from './src/db/database';
import {
  BIOMETRIC_KEY,
  getDailyGoal,
  getProgressStats,
  getSetting,
  getXp,
  listLanguages,
  setSetting,
  THEME_KEY,
} from './src/db/repositories';
import HomeScreen from './src/screens/HomeScreen';
import LearnScreen from './src/screens/LearnScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import AdminScreen from './src/screens/AdminScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import StoryScreen from './src/screens/StoryScreen';
import RevisionDeck from './src/components/RevisionDeck';
import TabBar from './src/components/TabBar';
import AppHeader from './src/components/AppHeader';
import SplashScreen from './src/components/SplashScreen';
import { ThemeProvider, useTheme, isThemeName, type ThemeName } from './src/theme';
import type { Language } from './src/core/types';

type Screen = 'home' | 'learn' | 'review' | 'dashboard' | 'admin' | 'story' | 'revision';

/**
 * App shell. State-based navigation; the dark pill tab bar (with the
 * floating play FAB) and the top bar are ALWAYS visible, so moving
 * between sections feels like one continuous app rather than separate
 * pages. Theme choice is persisted in the settings table.
 *
 * Privacy: no accounts, no analytics, no trackers — everything is local.
 */
export default function App() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [language, setLanguage] = useState<Language | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [themeName, setThemeName] = useState<ThemeName>('blush');

  useEffect(() => {
    (async () => {
      const database = await getDb();
      // v1 ships with Setswana seeded; additional languages arrive as data.
      const [langs, savedTheme] = await Promise.all([
        listLanguages(database),
        getSetting(database, THEME_KEY),
      ]);
      setDb(database);
      setLanguage(langs[0] ?? null);
      if (isThemeName(savedTheme)) setThemeName(savedTheme);
    })().catch((e) => console.error('Failed to open database', e));
  }, []);

  const persistTheme = useCallback(
    (name: ThemeName) => {
      setThemeName(name);
      if (db) setSetting(db, THEME_KEY, name).catch(() => undefined);
    },
    [db],
  );

  return (
    <ThemeProvider initial={themeName} onChange={persistTheme}>
      <SafeAreaProvider>
        <Shell db={db} language={language} screen={screen} setScreen={setScreen} />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

interface ShellProps {
  db: SQLite.SQLiteDatabase | null;
  language: Language | null;
  screen: Screen;
  setScreen: (s: Screen) => void;
}

const HEADER_TITLES: Record<Screen, { title: string; subtitle?: string }> = {
  home: { title: 'Dumela!', subtitle: 'Let’s play and learn' },
  learn: { title: 'Learn', subtitle: 'Pictures, words and saying them' },
  review: { title: 'Practice', subtitle: 'Flashcards and games' },
  dashboard: { title: 'Parent Zone', subtitle: 'Settings & progress' },
  admin: { title: 'Manage Words', subtitle: 'Add, record and edit' },
  story: { title: 'Story Time', subtitle: 'Listen and read along' },
  revision: { title: 'Revise', subtitle: 'Slide through your words' },
};

function Shell({ db, language, screen, setScreen }: ShellProps) {
  const { colors: c } = useTheme();
  /** Animated splash shows once on launch, over everything, then unmounts. */
  const [splash, setSplash] = useState(true);
  const hideSplash = useCallback(() => setSplash(false), []);

  /**
   * Entering the Parent Zone from outside it (Home/Learn/Review) is gated
   * behind biometrics when the parent has turned the lock on — this is the
   * ONLY enforcement point; the toggle in DashboardScreen just persists
   * the setting. Moving between dashboard <-> admin (already inside the
   * zone) never re-prompts.
   */
  const enterParentZone = useCallback(async () => {
    if (!db) return;
    try {
      const locked = (await getSetting(db, BIOMETRIC_KEY)) === '1';
      if (locked) {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Parent Zone',
          });
          if (!result.success) return;
        }
      }
    } catch {
      // Auth check failed unexpectedly — fail open rather than lock a
      // parent out of their own settings on a flaky device.
    }
    setScreen('dashboard');
  }, [db, setScreen]);

  if (!db || !language) {
    // Splash doubles as the loading screen while the database opens.
    if (splash) return <SplashScreen onDone={hideSplash} />;
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const header = HEADER_TITLES[screen];
  // Which tab (if any) is highlighted: admin lives under the Parent tab.
  const activeTab =
    screen === 'home' ? 'home' : screen === 'learn' ? 'learn' : screen === 'dashboard' || screen === 'admin' ? 'dashboard' : null;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StatusBar style={c.statusBar} />
      <AppHeader title={header.title} subtitle={header.subtitle} />

      <View style={styles.body}>
        {screen === 'home' && (
          <HomeScreen
            languageName={language.name}
            onReview={() => setScreen('review')}
            onLearn={() => setScreen('learn')}
            onRevise={() => setScreen('revision')}
            onStory={() => setScreen('story')}
            onParentZone={() => void enterParentZone()}
            loadStats={() => getProgressStats(db, language.id)}
            loadGoal={() => getDailyGoal(db)}
            loadXp={() => getXp(db)}
          />
        )}
        {screen === 'learn' && <LearnScreen db={db} languageId={language.id} />}
        {screen === 'review' && (
          <ReviewScreen
            db={db}
            languageId={language.id}
            onExit={() => setScreen('home')}
            onRevise={() => setScreen('revision')}
          />
        )}
        {screen === 'story' && (
          <StoryScreen
            db={db}
            languageId={language.id}
            onExit={() => setScreen('home')}
          />
        )}
        {screen === 'revision' && (
          <RevisionDeck
            db={db}
            languageId={language.id}
            onBack={() => setScreen('home')}
          />
        )}
        {screen === 'dashboard' && (
          <DashboardScreen
            db={db}
            languageId={language.id}
            languageName={language.name}
            onExit={() => setScreen('home')}
            onManageContent={() => setScreen('admin')}
          />
        )}
        {screen === 'admin' && (
          <AdminScreen
            db={db}
            languageId={language.id}
            languageName={language.name}
            onExit={() => setScreen('dashboard')}
          />
        )}
      </View>

      <TabBar
        active={activeTab}
        onHome={() => setScreen('home')}
        onLearn={() => setScreen('learn')}
        onParent={() => void enterParentZone()}
        onPlay={() => (screen === 'review' ? setScreen('home') : setScreen('review'))}
      />

      {splash && <SplashScreen onDone={hideSplash} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF5F5' },
  body: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

