/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, PALETTES } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settingsStore } from '@/settings/settingsRepository';
import { useStore } from '@/hooks/use-store';

export function useTheme() {
  const system = useColorScheme();
  const settings = useStore(settingsStore);
  const scheme = settings.theme === 'system' ? system : settings.theme;
  const mode = scheme === 'dark' ? 'dark' : 'light';

  // ?? Colors guards corrupted stored palette names at runtime.
  return (PALETTES[settings.palette] ?? Colors)[mode];
}
