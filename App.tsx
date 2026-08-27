import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type * as SQLite from 'expo-sqlite';
import { getDb } from './src/db/database';
import { getProgressStats, listLanguages } from './src/db/repositories';
import HomeScreen from './src/screens/HomeScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import AdminScreen from './src/screens/AdminScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import TabBar from './src/components/TabBar';
import { colors } from './src/theme';
import type { Language } from './src/core/types';

type Screen = 'home' | 'review' | 'dashboard' | 'admin';

/**
 * App shell. State-based navigation; the dark pill tab bar with the
 * floating amber play FAB is shown on the two top-level tabs and hidden
 * during focused full-screen tasks (review session, admin content entry).
 *
 * Privacy: no accounts, no analytics, no trackers — everything is local.
 */
export default function App() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [language, setLanguage] = useState<Language | null>(null);
  const [screen, setScreen] = useState<Screen>('home');

  useEffect(() => {
    (async () => {
      const database = await getDb();
      const langs = await listLanguages(database);
      // v1 ships with Setswana seeded; additional languages arrive as data.
      setDb(database);
      setLanguage(langs[0] ?? null);
    })().catch((e) => console.error('Failed to open database', e));
  }, []);

  if (!db || !language) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const showTabBar = screen === 'home' || screen === 'dashboard';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {screen === 'home' && (
        <HomeScreen
          languageName={language.name}
          onReview={() => setScreen('review')}
          onParentZone={() => setScreen('dashboard')}
          loadStats={() => getProgressStats(db, language.id)}
        />
      )}
      {screen === 'review' && (
        <ReviewScreen db={db} languageId={language.id} onExit={() => setScreen('home')} />
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

      {showTabBar && (
        <TabBar
          active={screen === 'home' ? 'home' : 'dashboard'}
          onHome={() => setScreen('home')}
          onParent={() => setScreen('dashboard')}
          onPlay={() => setScreen('review')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


