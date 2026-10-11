import { darkPalette, lightPalette, radius, scale, spacing, typography, type Palette } from './tokens';

export interface Theme {
  dark: boolean;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  scale: typeof scale;
}

// The design is light-first; the dark palette is kept in step but not enabled yet.
const DARK_MODE_ENABLED = false;

export function useTheme(): Theme {
  const dark = DARK_MODE_ENABLED;
  return { dark, colors: dark ? darkPalette : lightPalette, spacing, radius, typography, scale };
}

export { spacing, radius, typography, scale };
