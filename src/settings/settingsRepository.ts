import AsyncStorage from '@react-native-async-storage/async-storage';

import { createStore } from '@/hooks/use-store';
import { AppSettings } from '@/types';

import { DEFAULT_SETTINGS, sanitize } from './settingsSanitize';

export { DEFAULT_SETTINGS } from './settingsSanitize';

const KEY = 'openpocket.settings.v1';

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(sanitize(settings)));
}

export async function resetSettings(): Promise<AppSettings> {
  await AsyncStorage.removeItem(KEY);
  return { ...DEFAULT_SETTINGS };
}

/** Observable settings shared by all screens. */
export const settingsStore = createStore<AppSettings>({ ...DEFAULT_SETTINGS });
let initialized = false;

/** Load persisted settings once at app start. Safe to call repeatedly. */
export async function initSettings(): Promise<void> {
  if (initialized) return;
  initialized = true;
  settingsStore.set(await loadSettings());
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = sanitize({ ...settingsStore.get(), ...patch });
  settingsStore.set(next);
  void saveSettings(next);
  return next;
}

export async function resetAllSettings(): Promise<void> {
  const next = await resetSettings();
  settingsStore.set(next);
}
