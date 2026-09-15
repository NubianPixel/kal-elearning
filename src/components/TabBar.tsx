import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../theme';

/**
 * Vertical room the floating tab bar needs above the home indicator: wrap
 * (8 gap + 68 tall). Scroll screens pad their content bottoms with this so
 * nothing hides behind the bar.
 */
export const TAB_BAR_SPACE = 92;

export type TabKey = 'home' | 'practice' | 'library' | 'progress';

interface Props {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
}

const TABS: Array<{ key: TabKey; icon: string; label: string }> = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'practice', icon: 'game-controller-outline', label: 'Practice' },
  { key: 'library', icon: 'library-outline', label: 'Library' },
  { key: 'progress', icon: 'ribbon-outline', label: 'Progress' },
];

/** Dark pill tab bar with 4 plain tabs — Home, Practice, Library, Progress. */
export default function TabBar({ active, onSelect }: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <View style={styles.pill}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => onSelect(tab.key)}
            accessibilityLabel={`${tab.label} tab`}
          >
            <Ionicons
              name={tab.icon as React.ComponentProps<typeof Ionicons>['name']}
              size={22}
              color={active === tab.key ? c.accent : c.tabInactive}
            />
            <Text style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 18,
      height: 68,
      alignItems: 'center',
    },
    pill: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 68,
      borderRadius: 34,
      backgroundColor: c.dark,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
    },
    tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 44, justifyContent: 'center' },
    tabLabel: { fontSize: 11, fontWeight: '700', color: c.tabInactive },
    tabLabelActive: { color: c.accent },
  });
