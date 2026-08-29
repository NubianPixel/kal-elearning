import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  /** Optional element rendered on the right of the bar (e.g. streak/XP chip). */
  right?: React.ReactNode;
}

/**
 * Persistent top bar shared by every screen, so navigation feels like one
 * continuous app rather than separate pages. Owns the status-bar inset;
 * screens render their content below it. Theme-aware, always visible.
 */
export default function AppHeader({ title, subtitle, right }: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.brand}>
        <Ionicons name="school" size={20} color={c.onAccent} />
      </View>
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: c.background,
    },
    brand: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titles: { flex: 1 },
    title: { fontSize: 22, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 13, fontWeight: '600', color: c.muted, marginTop: 1 },
    right: { alignItems: 'center', justifyContent: 'center' },
  });
