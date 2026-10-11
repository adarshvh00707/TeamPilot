export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const typography = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
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
  danger: string;
  dangerSurface: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  info: string;
  infoSurface: string;
}

// Contrast: text/background >= 7:1, textMuted/background >= 4.5:1, primaryText/primary >= 4.5:1.
export const lightPalette: Palette = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F5',
  border: '#D5DAE1',
  text: '#111827',
  textMuted: '#4B5563',
  primary: '#1D4ED8',
  primaryText: '#FFFFFF',
  danger: '#B91C1C',
  dangerSurface: '#FDECEC',
  success: '#15803D',
  successSurface: '#E8F6EC',
  warning: '#92400E',
  warningSurface: '#FEF3C7',
  info: '#1E40AF',
  infoSurface: '#E5EDFF',
};

export const darkPalette: Palette = {
  background: '#0B0F17',
  surface: '#151B26',
  surfaceMuted: '#1E2533',
  border: '#2C3546',
  text: '#F3F4F6',
  textMuted: '#A7B0BE',
  primary: '#60A5FA',
  primaryText: '#0B1220',
  danger: '#F87171',
  dangerSurface: '#3A1616',
  success: '#4ADE80',
  successSurface: '#12301D',
  warning: '#FBBF24',
  warningSurface: '#3A2A0A',
  info: '#93C5FD',
  infoSurface: '#172443',
};
