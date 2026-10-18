import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { modelStore } from '@/ai/modelManager';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useStore } from '@/hooks/use-store';
import { useTheme } from '@/hooks/use-theme';
import { API_PORT, apiServerStore, startServer, stopServer } from '@/server/apiServer';
import { settingsStore, updateSettings } from '@/settings/settingsRepository';

const MAX_KEYS = 8;

/** 24 random bytes as hex with the OpenAI-style sk- prefix. */
function generateKey(): string {
  const hex = Array.from(Crypto.getRandomBytes(24), (b) => b.toString(16).padStart(2, '0')).join('');
  return `sk-${hex}`;
}

/** sk-1a2b3c…8f9e — enough to tell keys apart without exposing them. */
function maskKey(key: string): string {
  return key.length > 14 ? `${key.slice(0, 9)}…${key.slice(-4)}` : key;
}

export default function ServerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const server = useStore(apiServerStore);
  const model = useStore(modelStore);
  const apiKeys = useStore(settingsStore).apiServerKeys;
  const [ip, setIp] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Network.getIpAddressAsync()
      .then((addr) => alive && setIp(addr))
      .catch(() => alive && setIp(null));
    return () => {
      alive = false;
    };
  }, []);

  const base = `http://${ip ?? '<this-device-ip>'}:${API_PORT}`;
  const running = server.status === 'running';

  const copyUrl = async () => {
    await Clipboard.setStringAsync(`${base}/v1`);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  };

  const copyKey = async (key: string) => {
    await Clipboard.setStringAsync(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const addKey = () => {
    if (apiKeys.length >= MAX_KEYS) return;
    updateSettings({ apiServerKeys: [...apiKeys, generateKey()] });
  };

  const removeKey = (key: string) => {
    Alert.alert('Remove key?', `Clients using ${maskKey(key)} will be rejected.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => updateSettings({ apiServerKeys: apiKeys.filter((k) => k !== key) }),
      },
    ]);
  };

  const toggleServer = () => {
    if (running) {
      stopServer();
      return;
    }
    if (model.status !== 'loaded') {
      Alert.alert(
        'Load a model first',
        'The server needs a loaded model to answer requests. Download or load one from the Models tab.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Models', onPress: () => router.push('/models') },
        ],
      );
      return;
    }
    startServer();
  };

  const statusText =
    server.status === 'running'
      ? 'Running'
      : server.status === 'starting'
        ? 'Starting…'
        : server.status === 'error'
          ? 'Failed to start'
          : 'Stopped';
  const dotColor =
    server.status === 'running'
      ? theme.success
      : server.status === 'error'
        ? theme.danger
        : theme.textSecondary;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: Spacing.six + BottomTabInset,
          },
        ]}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle" style={styles.screenTitle}>
          Server
        </ThemedText>

        {/* Status */}
        <ThemedView type="backgroundElement" style={styles.heroCard}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <ThemedText type="subtitle" style={styles.statusText}>
              {statusText}
            </ThemedText>
          </View>
          {server.error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {server.error}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {running
              ? 'Other devices on this network can use the model loaded on this phone.'
              : 'Start the server to use the model from other apps and devices.'}
          </ThemedText>
          <Pressable
            onPress={toggleServer}
            disabled={server.status === 'starting'}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: running ? theme.danger : theme.accent },
              pressed && styles.pressed,
              server.status === 'starting' && { opacity: 0.5 },
            ]}>
            <ThemedText style={{ color: theme.accentText, fontWeight: '600', fontSize: 15 }}>
              {running ? 'Stop server' : 'Start server'}
            </ThemedText>
          </Pressable>
        </ThemedView>

        {/* Endpoint */}
        <Section title="Endpoint">
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.urlRow}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.urlText}
                numberOfLines={1}>
                {base}/v1
              </ThemedText>
              <Pressable
                onPress={() => void copyUrl()}
                style={({ pressed }) => [
                  styles.tinyButton,
                  { borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="small" themeColor="accent">
                  {copiedUrl ? 'Copied' : 'Copy'}
                </ThemedText>
              </Pressable>
            </View>
            <EndpointRow method="GET" path="/v1/models" />
            <EndpointRow method="POST" path="/v1/chat/completions" />
            <EndpointRow method="POST" path="/v1/responses" />
            <EndpointRow method="POST" path="/v1/completions" />
            <EndpointRow method="POST" path="/v1/messages" />
            <EndpointRow method="POST" path="/v1/messages/count_tokens" />
            <EndpointRow method="GET" path="/health" />
          </ThemedView>
        </Section>

        {/* API keys */}
        <Section title={`API keys${apiKeys.length ? ` · ${apiKeys.length}/${MAX_KEYS}` : ''}`}>
          <ThemedView type="backgroundElement" style={styles.card}>
            {apiKeys.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No key — anyone on the network can use the server. Generate a key
                to require authentication on every /v1 endpoint.
              </ThemedText>
            ) : (
              apiKeys.map((key) => (
                <View key={key} style={[styles.keyRow, { borderBottomColor: theme.border }]}>
                  <ThemedText type="small" style={styles.keyText} numberOfLines={1}>
                    {maskKey(key)}
                  </ThemedText>
                  <View style={styles.keyActions}>
                    <Pressable
                      onPress={() => void copyKey(key)}
                      style={({ pressed }) => [
                        styles.tinyButton,
                        { borderColor: theme.border },
                        pressed && styles.pressed,
                      ]}>
                      <ThemedText type="small" themeColor="accent">
                        {copiedKey === key ? 'Copied' : 'Copy'}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => removeKey(key)}
                      style={({ pressed }) => [styles.tinyButton, pressed && styles.pressed]}>
                      <ThemedText type="small" style={{ color: theme.danger }}>
                        Remove
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            <Pressable
              onPress={addKey}
              disabled={apiKeys.length >= MAX_KEYS}
              style={({ pressed }) => [
                styles.smallButton,
                { borderColor: theme.border, borderWidth: 1, alignSelf: 'flex-start' },
                pressed && styles.pressed,
                apiKeys.length >= MAX_KEYS && { opacity: 0.5 },
              ]}>
              <ThemedText type="small" themeColor="accent">
                + Generate key
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">
              Clients send a key as “Authorization: Bearer sk-…” or “x-api-key”.
              GET /health stays open without one.
            </ThemedText>
          </ThemedView>
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function EndpointRow({ method, path }: { method: string; path: string }) {
  return (
    <View style={styles.endpointRow}>
      <ThemedText type="small" style={styles.method}>
        {method}
      </ThemedText>
      <ThemedText type="small" style={styles.pathText}>
        {path}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.five,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  screenTitle: { fontSize: 28, lineHeight: 34 },
  section: { gap: Spacing.two },
  sectionTitle: { letterSpacing: 0.6, fontSize: 12 },
  heroCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 20, lineHeight: 24 },
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  urlText: { flex: 1 },
  endpointRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  method: { width: 44, fontWeight: '700' },
  pathText: { flex: 1 },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  keyText: { flex: 1 },
  keyActions: { flexDirection: 'row', gap: Spacing.one },
  tinyButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallButton: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },
});
