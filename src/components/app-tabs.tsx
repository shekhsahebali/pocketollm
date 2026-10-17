import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useStore } from '@/hooks/use-store';
import { settingsStore } from '@/settings/settingsRepository';

export default function AppTabs() {
  // Follow the in-app theme preference (not just the system scheme) so the
  // native tab bar matches the rest of the UI when the user picks Light/Dark.
  const systemScheme = useColorScheme();
  const preference = useStore(settingsStore).theme;
  const scheme = preference === 'system' ? systemScheme : preference;
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      iconColor={{ default: colors.textSecondary, selected: colors.text }}
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: colors.text },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.fill" md="chat" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="models">
        <NativeTabs.Trigger.Label>Models</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="arrow.down.circle.fill" md="download" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
