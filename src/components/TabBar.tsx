import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../theme';

/**
 * Vertical room the floating tab bar needs above the home indicator:
 * wrap (8 gap + 96 tall) plus the FAB's 10px overhang. Scroll screens pad
 * their content bottoms with this so nothing hides behind the bar.
 */
export const TAB_BAR_SPACE = 120;

interface Props {
  active: 'home' | 'learn' | 'dashboard' | null;
  onHome: () => void;
  onLearn: () => void;
  onParent: () => void;
  onPlay: () => void;
}

/**
 * Dark pill tab bar with floating center FAB, matching the reference
 * design. Positioned above the home-indicator safe area. Three tabs
 * (Home / Learn / Parent) plus the FAB that starts a review session.
 */
export default function TabBar({ active, onHome, onLearn, onParent, onPlay }: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);

  const tabs: Array<{
    key: 'home' | 'learn' | 'dashboard';
    icon: string;
    label: string;
    onPress: () => void;
  }> = [
    { key: 'home', icon: 'home', label: 'Home', onPress: onHome },
    { key: 'learn', icon: 'school-outline', label: 'Learn', onPress: onLearn },
    { key: 'dashboard', icon: 'person', label: 'Settings', onPress: onParent },
  ];

  return (
    <View
      style={[styles.wrap, { bottom: insets.bottom + 8 }]}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={tab.onPress}
            accessibilityLabel={`${tab.label} tab`}
          >
            <Ionicons
              name={tab.icon as React.ComponentProps<typeof Ionicons>['name']}
              size={22}
              color={active === tab.key ? c.accent : c.tabInactive}
            />
            <Text
              style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.fab} onPress={onPlay} accessibilityLabel="Start learning">
        <Ionicons name="play" size={30} color={c.onAccent} />
      </Pressable>
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
      height: 96,
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
      paddingHorizontal: 26,
    },
    tab: { alignItems: 'center', gap: 3 },
    tabLabel: { fontSize: 11, fontWeight: '700', color: c.tabInactive },
    tabLabelActive: { color: c.accent },
    fab: {
      position: 'absolute',
      bottom: 30,
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 6,
      borderColor: c.background,
    },
  });
