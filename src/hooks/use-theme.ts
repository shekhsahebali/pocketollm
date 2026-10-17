/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settingsStore } from '@/settings/settingsRepository';
import { useStore } from '@/hooks/use-store';

export function useTheme() {
  const system = useColorScheme();
  const preference = useStore(settingsStore).theme;
  const scheme = preference === 'system' ? system : preference;
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
