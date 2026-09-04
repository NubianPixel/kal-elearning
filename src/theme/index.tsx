/**
 * Design system — five kid-friendly themes, selectable in the Parent Zone
 * and persisted in the local settings table.
 *
 * Each theme defines a full token set. Derived tokens (onPrimary, faint
 * overlays, borders…) are computed per theme so contrast always works —
 * including Night, the built-in dark mode.
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

/** System serif — Georgia (iOS) / Noto Serif (Android), no bundled font asset needed. */
export const SERIF_FONT_FAMILY = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

export type ThemeName = 'blush' | 'vintage' | 'retro' | 'happy' | 'night';

export interface ThemeColors {
  /** Screen background. */
  background: string;
  /** Cards, chips, inputs. */
  card: string;
  /** Brand surface (hero cards, selected chips, FAB-adjacent buttons). */
  primary: string;
  /** Deeper brand — pressed states. */
  primaryDark: string;
  /** Deepest brand — icons/tints on soft surfaces. */
  primaryDeep: string;
  /** Text on primary surfaces. */
  onPrimary: string;
  /** Secondary text on primary surfaces. */
  onPrimaryMuted: string;
  /** Translucent chips/tracks on primary surfaces. */
  onPrimaryFaint: string;
  /** Soft brand fill — icon wells, disabled tracks. */
  primarySoft: string;
  /** Highlight surface (FAB, active tab, medals). */
  accent: string;
  /** Text on accent surfaces. */
  onAccent: string;
  /** Soft accent fill — image placeholders, icon wells. */
  accentSoft: string;
  /** Dark surfaces: tab bar pill, number badges. */
  dark: string;
  /** Text on dark surfaces. */
  onDark: string;
  text: string;
  muted: string;
  /** Inactive borders, unfilled progress tracks. */
  border: string;
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
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  blush: {
    background: '#FFF5F5',
    card: '#FFFFFF',
    primary: '#E2B4BD',
    primaryDark: '#C98F9C',
    primaryDeep: '#B4778A',
    onPrimary: '#4A4A4A',
    onPrimaryMuted: 'rgba(74,74,74,0.75)',
    onPrimaryFaint: 'rgba(74,74,74,0.12)',
    primarySoft: '#F7D6D0',
    accent: '#E2B4BD',
    onAccent: '#4A4A4A',
    accentSoft: '#FBEAEC',
    dark: '#4A4A4A',
    onDark: '#FFFFFF',
    text: '#4A4A4A',
    muted: '#A89297',
    border: '#EFD8DA',
    shadow: '#4A4A4A',
    tabInactive: '#C0A9AE',
    statusBar: 'dark',
    correct: '#3D7A5F',
    wrong: '#D96C5F',
    wrongSoft: '#FBE9E5',
    danger: '#C4553F',
  },
  vintage: {
    // #524646 brown, #A8A492 sage, #FCF2E5 cream, #EC5B38 persimmon
    background: '#FCF2E5',
    card: '#FFFCF6',
    primary: '#524646',
    primaryDark: '#3F3535',
    primaryDeep: '#7D7259',
    onPrimary: '#FCF2E5',
    onPrimaryMuted: 'rgba(252,242,229,0.75)',
    onPrimaryFaint: 'rgba(252,242,229,0.14)',
    primarySoft: '#E9E2D4',
    accent: '#EC5B38',
    onAccent: '#FFF3ED',
    accentSoft: '#FAE3D9',
    dark: '#3A3232',
    onDark: '#FCF2E5',
    text: '#453B3B',
    muted: '#8F8474',
    border: '#E4D9C4',
    shadow: '#524646',
    tabInactive: '#C0B6A4',
    statusBar: 'dark',
    correct: '#5B7A52',
    wrong: '#C4553F',
    wrongSoft: '#F5E0D8',
    danger: '#C4553F',
  },
  retro: {
    // #FF9E20 orange, #215E61 teal, #1D2128 ink, #F4F2F2 off-white
    background: '#F4F2F2',
    card: '#FFFFFF',
    primary: '#215E61',
    primaryDark: '#17474A',
    primaryDeep: '#17474A',
    onPrimary: '#F4F2F2',
    onPrimaryMuted: 'rgba(244,242,242,0.75)',
    onPrimaryFaint: 'rgba(244,242,242,0.14)',
    primarySoft: '#DCE9E9',
    accent: '#FF9E20',
    onAccent: '#1D2128',
    accentSoft: '#FFEACF',
    dark: '#1D2128',
    onDark: '#F4F2F2',
    text: '#1D2128',
    muted: '#7B8386',
    border: '#E0DCD6',
    shadow: '#1D2128',
    tabInactive: '#8FA3A4',
    statusBar: 'dark',
    correct: '#215E61',
    wrong: '#D96C5F',
    wrongSoft: '#FBE9E5',
    danger: '#C4553F',
  },
  happy: {
    // #F599C6 pink, #FFEA88 lemon, #7DCCAD mint, #4D6787 slate blue
    background: '#FFF8E7',
    card: '#FFFFFF',
    primary: '#F599C6',
    primaryDark: '#E77FB2',
    primaryDeep: '#C75F96',
    onPrimary: '#31435C',
    onPrimaryMuted: 'rgba(49,67,92,0.75)',
    onPrimaryFaint: 'rgba(49,67,92,0.12)',
    primarySoft: '#FDE3F0',
    accent: '#FFEA88',
    onAccent: '#31435C',
    accentSoft: '#FFF3C4',
    dark: '#3E5470',
    onDark: '#FFF8E7',
    text: '#31435C',
    muted: '#8D8FA0',
    border: '#F0E4CC',
    shadow: '#4D6787',
    tabInactive: '#9FA8C4',
    statusBar: 'dark',
    correct: '#2E8A67',
    wrong: '#E0698C',
    wrongSoft: '#FDE7EF',
    danger: '#D9534F',
  },
  night: {
    // #0F3040 deep teal, #464858 slate, #A56F63 clay, #D99B7F apricot
    background: '#0F3040',
    card: '#464858',
    primary: '#A56F63',
    primaryDark: '#8F5B50',
    primaryDeep: '#D99B7F',
    onPrimary: '#FFF1EA',
    onPrimaryMuted: 'rgba(255,241,234,0.75)',
    onPrimaryFaint: 'rgba(255,241,234,0.14)',
    primarySoft: '#544447',
    accent: '#D99B7F',
    onAccent: '#0F3040',
    accentSoft: '#544447',
    dark: '#0A2430',
    onDark: '#F1E9E4',
    text: '#F1E9E4',
    muted: '#A7B4BE',
    border: '#2C4A5C',
    shadow: '#000000',
    tabInactive: '#7E8C97',
    statusBar: 'light',
    correct: '#7DCCAD',
    wrong: '#E08573',
    wrongSoft: '#54403F',
    danger: '#C4553F',
  },
};

export const THEME_ORDER: readonly ThemeName[] = [
  'blush',
  'vintage',
  'retro',
  'happy',
  'night',
];

export const DEFAULT_THEME: ThemeName = 'blush';

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && value in THEMES;
}

export const THEME_LABELS: Record<ThemeName, string> = {
  blush: 'Blush',
  vintage: 'Vintage',
  retro: 'Retro',
  happy: 'Happy',
  night: 'Night',
};

/** Text presets, built per theme (sizes/weights shared, colors themed). */
export function makeTextStyles(c: ThemeColors) {
  return {
    titleText: { fontSize: 30, fontWeight: '800' as const, color: c.text },
    sectionTitle: { fontSize: 20, fontWeight: '800' as const, color: c.text },
    bigText: { fontSize: 24, fontWeight: '700' as const, color: c.text },
    mutedText: { fontSize: 13, fontWeight: '600' as const, color: c.muted },
    /** Stat/score numbers (dashboard tiles, session summaries) — tabular
     *  digits so they don't jitter width as values change. */
    heroNumber: {
      fontSize: 22,
      fontWeight: '800' as const,
      color: c.text,
      fontVariant: ['tabular-nums'] as const,
    },
    /** Small caps-style labels/badges. */
    label: { fontSize: 12, fontWeight: '700' as const, color: c.muted },
    /** Personal-greeting moments (e.g. the home screen's "Dumela!") — an
     *  italic serif on a system font, not a bundled asset. */
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
  md: { offset: 4, opacity: 0.1, radius: 10, native: 4 },
  lg: { offset: 5, opacity: 0.2, radius: 12, native: 7 },
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

/**
 * Provides the active theme tokens. `onChange` lets the shell persist the
 * choice (settings table) — the provider itself stays storage-agnostic.
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
    () => ({ colors: THEMES[name], name, setTheme }),
    [name, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

