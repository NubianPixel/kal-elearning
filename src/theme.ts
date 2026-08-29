/**
 * Design system — blush palette:
 * #FFF5F5 background, #F7D6D0 soft pink, #E2B4BD dusty rose (brand),
 * #4A4A4A charcoal for text and dark surfaces. White cards, dark pill
 * tab bar with floating rose FAB, Ionicons only — zero emojis.
 *
 * Correct/wrong/danger stay semantic (answer feedback), not decorative.
 */
export const colors = {
  background: '#FFF5F5',
  card: '#FFFFFF',
  primary: '#E2B4BD',
  primaryDark: '#C98F9C', // derived deeper rose — pressed states, borders
  primaryDeep: '#B4778A', // derived deepest rose — icons/tints on soft pink
  primarySoft: '#F7D6D0',
  accent: '#E2B4BD',
  accentSoft: '#FBEAEC',
  dark: '#4A4A4A',
  text: '#4A4A4A',
  muted: '#A89297',
  correct: '#3D7A5F',
  wrong: '#D96C5F',
  danger: '#C4553F',
};

export const childButton = {
  minHeight: 96,
  borderRadius: 24,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  paddingHorizontal: 24,
  marginVertical: 8,
};

export const titleText = {
  fontSize: 30,
  fontWeight: '800' as const,
  color: colors.text,
};

export const sectionTitle = {
  fontSize: 20,
  fontWeight: '800' as const,
  color: colors.text,
};

export const bigText = {
  fontSize: 24,
  fontWeight: '700' as const,
  color: colors.text,
};

export const mutedText = {
  fontSize: 13,
  fontWeight: '600' as const,
  color: colors.muted,
};

