import { useColorScheme } from 'react-native';
import { darkPalette, lightPalette, radius, spacing, typography, type Palette } from './tokens';

export interface Theme {
  dark: boolean;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  return { dark, colors: dark ? darkPalette : lightPalette, spacing, radius, typography };
}

export { spacing, radius, typography };
