/**
 * Design system - KAL e-Learning single warm palette.
 *
 * All colors derive from the design spec: cream background, deep green
 * primary, amber accent. The multi-theme system is replaced with one
 * consistent identity.
 *
 * Correct/wrong/danger stay semantic (answer feedback), not decorative.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

/** Nunito - primary UI font (weights 400/600/700/800/900 via Expo Google Fonts). */
export const NUNITO_FONT_FAMILY = 'Nunito';

/** System serif - Georgia (iOS) / Noto Serif (Android), no bundled font asset needed. */
export const SERIF_FONT_FAMILY = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

export type ThemeName = 'kal';

export interface ThemeColors {
  /** Screen background - warm cream #F6F4E8. */
  background: string;
  /** Cards, chips, inputs. */
  card: string;
  /** Brand surface (hero cards, selected chips, primary buttons). */
  primary: string;
  /** Deeper brand - pressed states. */
  primaryDark: string;
  /** Deepest brand - icons/tints on soft surfaces. */
  primaryDeep: string;
  /** Text on primary surfaces. */
  onPrimary: string;
  /** Secondary text on primary surfaces. */
  onPrimaryMuted: string;
  /** Translucent chips/tracks on primary surfaces. */
  onPrimaryFaint: string;
  /** Soft brand fill - icon wells, disabled tracks. */
  primarySoft: string;
  /** Highlight surface (FAB, active tab, medals). */
  accent: string;
  /** Text on accent surfaces. */
  onAccent: string;
  /** Soft accent fill - image placeholders, icon wells. */
  accentSoft: string;
  /** Dark surfaces: tab bar pill. */
  dark: string;
  /** Text on dark surfaces. */
  onDark: string;
  text: string;
  muted: string;
  shadow: string;
  /** Inactive tab labels/icons on the dark pill. */
  tabInactive: string;
  /** Expo StatusBar style for this theme. */
  statusBar: 'dark' | 'light';
  correct: string;
  wrong: string;
  /** Soft wrong-answer fill. */
  wrongSoft: string;
  danger: string;
  /** Subtle borders on cream surfaces. */
  border: string;
}

const THEME: ThemeColors = {
  background: '#F6F4E8',
  card: '#FFFFFF',
  primary: '#3D7A5F',
  primaryDark: '#2C5E48',
  primaryDeep: '#1F4A38',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255, 255, 255, 0.7)',
  onPrimaryFaint: 'rgba(255, 255, 255, 0.18)',
  primarySoft: '#E3EDE4',
  accent: '#F2B84B',
  onAccent: '#1B1A16',
  accentSoft: '#FBEFD4',
  dark: '#1B1A16',
  onDark: '#FFFFFF',
  text: '#20211C',
  muted: '#8B8B80',
  shadow: '#3D7A5F',
  tabInactive: '#A09F97',
  statusBar: 'dark',
  correct: '#3D7A5F',
  wrong: '#D96C5F',
  wrongSoft: '#FBE8E5',
  danger: '#C4553F',
  border: '#E5E2D6',
};

export function isThemeName(value: string | null): value is ThemeName {
  return value === 'kal';
}

/** Text presets, built per theme (sizes/weights shared, colors themed). */
export function makeTextStyles(c: ThemeColors) {
  return {
    titleText: { fontSize: 30, fontWeight: '800' as const, color: c.text },
    sectionTitle: { fontSize: 20, fontWeight: '800' as const, color: c.text },
    bigText: { fontSize: 24, fontWeight: '700' as const, color: c.text },
    mutedText: { fontSize: 13, fontWeight: '600' as const, color: c.muted },
    heroNumber: {
      fontSize: 22,
      fontWeight: '800' as const,
      color: c.text,
      fontVariant: ['tabular-nums'] as const,
    },
    label: { fontSize: 12, fontWeight: '700' as const, color: c.muted },
    /** Personal-greeting moments - italic serif (Georgia) for warmth. */
    displayText: {
      fontFamily: SERIF_FONT_FAMILY,
      fontStyle: 'italic' as const,
      fontSize: 28,
      fontWeight: '600' as const,
      color: c.text,
    },
  };
}

/** Shared layout for full-width primary buttons (no colors). */
export const primaryButton = {
  minHeight: 64,
  borderRadius: 24,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  paddingHorizontal: 24,
  marginVertical: 8,
};

export type ElevationTier = 'sm' | 'md' | 'lg';

const ELEVATION: Record<ElevationTier, { offset: number; opacity: number; radius: number; native: number }> = {
  sm: { offset: 2, opacity: 0.06, radius: 6, native: 2 },
  md: { offset: 4, opacity: 0.08, radius: 10, native: 4 },
  lg: { offset: 5, opacity: 0.12, radius: 12, native: 7 },
};

/** Shared card/floating-element shadow, themed by `c.shadow`. */
export function cardShadow(c: ThemeColors, tier: ElevationTier = 'md') {
  const e = ELEVATION[tier];
  return {
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: e.offset },
    shadowOpacity: e.opacity,
    shadowRadius: e.radius,
    elevation: e.native,
  };
}

interface ThemeContextValue {
  colors: ThemeColors;
  name: ThemeName;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_THEME: ThemeName = 'kal';

/**
 * Provides the active theme tokens. `onChange` lets the shell persist the
 * choice (settings table) - the provider itself stays storage-agnostic.
 */
export function ThemeProvider({
  initial = DEFAULT_THEME,
  onChange,
  children,
}: {
  initial?: ThemeName;
  onChange?: (name: ThemeName) => void;
  children: ReactNode;
}) {
  const [name, setName] = useState<ThemeName>(initial);
  const setTheme = useCallback(
    (next: ThemeName) => {
      setName(next);
      onChange?.(next);
    },
    [onChange],
  );
  const value = useMemo<ThemeContextValue>(
    () => ({ colors: THEME, name, setTheme }),
    [name, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
