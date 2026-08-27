import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface Props {
  active: 'home' | 'dashboard';
  onHome: () => void;
  onParent: () => void;
  onPlay: () => void;
}

/**
 * Dark pill tab bar with floating amber center FAB, matching the
 * reference design. Positioned above the home-indicator safe area.
 */
export default function TabBar({ active, onHome, onParent, onPlay }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.wrap, { bottom: insets.bottom + 8 }]}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        <Pressable style={styles.tab} onPress={onHome} accessibilityLabel="Home tab">
          <Ionicons name="home" size={22} color={active === 'home' ? colors.accent : '#6E6E64'} />
          <Text style={[styles.tabLabel, active === 'home' && styles.tabLabelActive]}>Home</Text>
        </Pressable>

        <View style={styles.centerGap} />

        <Pressable style={styles.tab} onPress={onParent} accessibilityLabel="Parent tab">
          <Ionicons
            name="person"
            size={22}
            color={active === 'dashboard' ? colors.accent : '#6E6E64'}
          />
          <Text style={[styles.tabLabel, active === 'dashboard' && styles.tabLabelActive]}>
            Parent
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.fab} onPress={onPlay} accessibilityLabel="Start learning">
        <Ionicons name="play" size={30} color={colors.dark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.dark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  tab: { alignItems: 'center', gap: 3 },
  tabLabel: { fontSize: 11, fontWeight: '700', color: '#6E6E64' },
  tabLabelActive: { color: colors.accent },
  centerGap: { width: 84 },
  fab: {
    position: 'absolute',
    bottom: 30,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: colors.background,
  },
});
