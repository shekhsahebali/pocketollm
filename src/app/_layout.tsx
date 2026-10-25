import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { PixelRatio, useColorScheme } from 'react-native';

import { initChatSession } from '@/chat/chatSession';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
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
  const settings = useStore(settingsStore);
  const themePreference = settings.theme;
  const scheme = themePreference === 'system' ? systemScheme : themePreference;
  const fontScale = settings.fontScale ?? 1;

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    PixelRatio.getFontScale = () => fontScale;
  }, [fontScale]);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
