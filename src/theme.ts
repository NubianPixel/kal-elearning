/**
 * Design system — extracted from the user's reference UI:
 * warm cream background, deep-green hero cards, amber accents,
 * white cards, dark pill tab bar with floating amber FAB.
 */

export const colors = {
  background: '#F6F4E8',
  card: '#FFFFFF',
  primary: '#3D7A5F',
  primaryDark: '#2C5E48',
  primarySoft: '#E3EDE4',
  accent: '#F2B84B',
  accentSoft: '#FBEFD4',
  dark: '#1B1A16',
  text: '#20211C',
  muted: '#8B8B80',
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

