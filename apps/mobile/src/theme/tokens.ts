/** `gutter` is the horizontal page margin and card padding on phones. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const typography = {
  display: { fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1.5 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypographyVariant = keyof typeof typography;

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  /** The dark pill used for the tab bar, time chips, and selected states. */
  ink: string;
  inkText: string;
  danger: string;
  dangerSurface: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  info: string;
  infoSurface: string;
}

// Soft monochrome with black pill accents and green/amber/red status colors.
// Contrast: text/background >= 7:1, textMuted/background >= 4.5:1, primaryText/primary >= 4.5:1.
export const lightPalette: Palette = {
  background: '#EDEDEF',
  surface: '#F8F8F9',
  surfaceMuted: '#E4E4E7',
  border: '#DCDCE0',
  text: '#111113',
  textMuted: '#5A5A63',
  primary: '#111113',
  primaryText: '#FFFFFF',
  ink: '#16161A',
  inkText: '#FFFFFF',
  danger: '#C2410C',
  dangerSurface: '#FDE3DA',
  success: '#15803D',
  successSurface: '#D8F3DF',
  warning: '#A16207',
  warningSurface: '#FCEFC7',
  info: '#1F2937',
  infoSurface: '#E4E4E7',
};

export const darkPalette: Palette = {
  background: '#0C0C0E',
  surface: '#1A1A1E',
  surfaceMuted: '#26262B',
  border: '#2E2E34',
  text: '#F4F4F5',
  textMuted: '#A1A1AA',
  primary: '#F4F4F5',
  primaryText: '#111113',
  ink: '#F4F4F5',
  inkText: '#111113',
  danger: '#FB923C',
  dangerSurface: '#3A1E12',
  success: '#4ADE80',
  successSurface: '#12301D',
  warning: '#FACC15',
  warningSurface: '#3A300A',
  info: '#E4E4E7',
  infoSurface: '#26262B',
};

/** Accent colors for charts and progress bars (low → high). */
export const scale = { low: '#F28B82', mid: '#F5B85A', high: '#5BCB7A' } as const;
