import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { initChatSession } from '@/chat/chatSession';
import { useStore } from '@/hooks/use-store';
import { reconcileModels } from '@/models/storage';
import { initSettings, settingsStore } from '@/settings/settingsRepository';

SplashScreen.preventAutoHideAsync();

let appInitStarted = false;

/** Idempotent app start: settings, stored models, last conversation. */
function initApp(): void {
  if (appInitStarted) return;
  appInitStarted = true;
  void (async () => {
    try {
      await initSettings();
      await reconcileModels().catch(() => {});
      await initChatSession();
    } finally {
      await SplashScreen.hideAsync().catch(() => {});
    }
  })();
}

export default function TabLayout() {
  const systemScheme = useColorScheme();
  const themePreference = useStore(settingsStore).theme;
  const scheme = themePreference === 'system' ? systemScheme : themePreference;

  useEffect(() => {
    initApp();
  }, []);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
