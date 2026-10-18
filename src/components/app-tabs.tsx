import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  // useTheme resolves mode (system/light/dark) AND palette, so the native
  // tab bar matches the rest of the UI for every theme combination.
  const colors = useTheme();

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
      <NativeTabs.Trigger name="server">
        <NativeTabs.Trigger.Label>Server</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="network" md="lan" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
