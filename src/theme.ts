/** Shared visual theme: child-friendly, high contrast, large targets. */

export const colors = {
  background: '#FFF8E7',
  primary: '#4C7A34',
  primaryDark: '#38641F',
  accent: '#F2A93B',
  card: '#FFFFFF',
  text: '#2E2A20',
  correct: '#4CAF50',
  wrong: '#E57373',
  muted: '#8A8574',
  danger: '#C62828',
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
  fontSize: 32,
  fontWeight: '800' as const,
  color: colors.text,
};

export const bigText = {
  fontSize: 24,
  fontWeight: '700' as const,
  color: colors.text,
};
