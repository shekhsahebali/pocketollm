import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import { BuildInfo } from 'llama.rn';
import { Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadModel, modelStore, unloadModel } from '@/ai/modelManager';
import { clearAllChats } from '@/chat/chatSession';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Image } from 'expo-image';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useStore } from '@/hooks/use-store';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes } from '@/models/catalog';
import { modelsStore, totalDownloadedBytes } from '@/models/storage';
import {
  DEFAULT_SETTINGS,
  resetAllSettings,
  settingsStore,
  updateSettings,
} from '@/settings/settingsRepository';
import { ColorPalette, GpuMode, ThemeSetting } from '@/types';

const CONTEXT_SIZES = [1024, 2048, 4096] as const;
const MAX_TOKEN_CHOICES = [128, 256, 512, 1024] as const;
const TOP_K_CHOICES = [20, 40, 64, 128] as const;
const IMAGE_TOKEN_CHOICES = [256, 512, 1024, 2048] as const;
const THEME_CHOICES = ['system', 'light', 'dark'] as const;
const PALETTE_CHOICES: readonly ColorPalette[] = [
  'emerald',
  'indigo',
  'ocean',
  'rose',
  'amber',
];

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useStore(settingsStore);
  const model = useStore(modelStore);
  useStore(modelsStore); // re-render when downloads change
  const storageBytes = totalDownloadedBytes();
  // Local draft mirrors the store at mount (initSettings completes long before this tab is opened);
  // Save/Reset handlers below keep it in sync afterwards — no sync effect needed.
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [promptSaved, setPromptSaved] = useState(false);

  const needsReload =
    model.status === 'loaded' &&
    model.loadedContextSize !== null &&
    model.loadedContextSize !== settings.contextSize;
  const deviceLabel =
    Device.manufacturer && Device.modelName
      ? `${Device.manufacturer} ${Device.modelName}`
      : (Device.modelName ?? 'Unknown device');

  const savePrompt = () => {
    updateSettings({ systemPrompt: systemPrompt.trim() || DEFAULT_SETTINGS.systemPrompt });
    setSystemPrompt(settingsStore.get().systemPrompt);
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 1500);
  };

  const resetPrompt = () => {
    setSystemPrompt(DEFAULT_SETTINGS.systemPrompt);
    updateSettings({ systemPrompt: DEFAULT_SETTINGS.systemPrompt });
    setPromptSaved(false);
  };

  const clearHistory = () => {
    Alert.alert(
      'Clear chat history?',
      'All conversations will be permanently deleted from this phone. Downloaded models are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear history', style: 'destructive', onPress: () => void clearAllChats() },
      ],
    );
  };

  const resetAll = () => {
    Alert.alert(
      'Reset settings?',
      'Inference settings, system prompt, and appearance return to defaults. Chat history and downloaded models are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void resetAllSettings();
            setSystemPrompt(DEFAULT_SETTINGS.systemPrompt);
            setPromptSaved(false);
          },
        },
      ],
    );
  };

  const reloadModel = () => {
    const id = model.model?.id;
    if (!id) return;
    void unloadModel().then(() => loadModel(id));
  };

  // Android battery-optimization exemption — the OS "permission" that decides
  // whether backgrounded apps may keep running long tasks.
  const requestBackgroundRunning = async () => {
    try {
      const pkg = Constants.expoConfig?.android?.package ?? 'com.pocketollm.app';
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        { data: `package:${pkg}` },
      );
    } catch {
      Alert.alert(
        'Could not open the setting',
        'Open system Settings → Battery → this app and set it to Unrestricted.',
      );
    }
  };

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
          Settings
        </ThemedText>
         {/* Device profile */}
        <Section title="">
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.profileRow}>
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                <Smartphone size={26} color={theme.accentText} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {Device.deviceName ?? deviceLabel}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {deviceLabel}
                  {Device.isDevice ? '' : ' · Emulator / simulator'}
                </ThemedText>
              </View>
            </View>
            <SpecRow
              label="Operating system"
              value={`${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim()}
            />
            <SpecRow
              label="RAM"
              value={Device.totalMemory ? formatBytes(Device.totalMemory) : 'Unknown'}
            />
            <SpecRow label="Free storage" value={formatBytes(Paths.availableDiskSpace)} />
            
            <ThemedText type="small" themeColor="textSecondary">
              Models load into RAM — the larger 4B–7B entries want most of an 8 GB
              device to themselves. Free storage is the space model downloads can use.
            </ThemedText>
            {/* ponytail: CPU core count needs react-native-device-info — add when asked. */}
          </ThemedView>
        </Section>

        <Section title="GPU Acceleration">
          <ThemedView type="backgroundElement" style={styles.card}>
            <Segmented<GpuMode>
              options={['auto', 'gpu', 'cpu']}
              value={settings.gpuMode}
              onChange={(v) => updateSettings({ gpuMode: v })}
              labelFor={(v) =>
                v === 'auto' ? 'Auto' : v === 'gpu' ? 'GPU' : 'CPU'
              }
              accessibilityLabel="GPU acceleration mode"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {settings.gpuMode === 'auto'
                ? 'Auto (Try GPU first, then CPU fallback)'
                : settings.gpuMode === 'gpu'
                  ? 'GPU (Maximum speed)'
                  : 'CPU (Stable mode with lower speed)'}
            </ThemedText>
            {settings.gpuMode !== 'cpu' && (
              <>
                <View style={styles.specRow}>
                  <ThemedText type="smallBold" style={styles.flex}>
                    Number of layers to store in GPU memory
                  </ThemedText>
                  <View style={styles.stepperRow}>
                    <Pressable
                      onPress={() => updateSettings({ gpuLayers: Math.max(-1, settings.gpuLayers - 1) })}
                      style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
                      <ThemedText type="small">-</ThemedText>
                    </Pressable>
                    <View style={[styles.stepperValue, { borderColor: theme.border }]}>
                      <ThemedText type="small">{settings.gpuLayers === -1 ? 'All' : settings.gpuLayers}</ThemedText>
                    </View>
                    <Pressable
                      onPress={() => updateSettings({ gpuLayers: Math.min(200, settings.gpuLayers + 1) })}
                      style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
                      <ThemedText type="small">+</ThemedText>
                    </Pressable>
                  </View>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  -1 or "All" = offload all layers to GPU. Lower values use less VRAM.
                </ThemedText>
              </>
            )}
          </ThemedView>
        </Section>

        {/* Background running */}
        <Section title="Background">
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.specRow}>
              <ThemedText type="smallBold" style={styles.flex}>
                Long tasks while backgrounded
              </ThemedText>
              <Switch
                value={settings.backgroundRunning}
                onValueChange={(v) => {
                  updateSettings({ backgroundRunning: v });
                }}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={theme.backgroundElement}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {Platform.OS === 'android'
                ? 'Android can pause or stop apps in the background, interrupting downloads and generation. While this is on, the app holds a wake lock during loads, generation, and downloads, and can be excluded from battery optimization so long tasks keep running when you switch away.'
                : 'iOS suspends apps in the background — downloads and generation pause until you return. This toggle keeps the screen awake while a task runs in the foreground; there is no permission to request.'}
            </ThemedText>
            {settings.backgroundRunning && Platform.OS === 'android' && (
              <Pressable
                onPress={() => void requestBackgroundRunning()}
                style={({ pressed }) => [styles.linkLike, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="accent">
                  Allow background running…
                </ThemedText>
              </Pressable>
            )}
          </ThemedView>
        </Section>

         {/* Appearance */}
        <Section title="Appearance">
          <Segmented
            options={THEME_CHOICES}
            value={settings.theme}
            onChange={(appearance) =>
              updateSettings({ theme: appearance as ThemeSetting })
            }
            labelFor={(v) => (v === 'system' ? 'System' : v === 'light' ? 'Light' : 'Dark')}
            accessibilityLabel="Appearance"
          />
          <Segmented
            options={PALETTE_CHOICES}
            value={settings.palette}
            onChange={(palette) => updateSettings({ palette })}
            labelFor={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
            accessibilityLabel="Color theme"
          />
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.specRow}>
              <ThemedText type="smallBold" style={styles.flex}>
                Font size
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {settings.fontScale.toFixed(1)}x
              </ThemedText>
            </View>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => updateSettings({ fontScale: Math.max(0.8, Number((settings.fontScale - 0.1).toFixed(1))) })}
                style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
                <ThemedText type="small">-</ThemedText>
              </Pressable>
              <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                <View
                  style={{
                    height: 4,
                    backgroundColor: theme.backgroundSelected,
                    borderRadius: 2,
                  }}>
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      height: 4,
                      width: `${((settings.fontScale - 0.8) / 0.8) * 100}%`,
                      backgroundColor: theme.accent,
                      borderRadius: 2,
                    }}
                  />
                </View>
              </View>
              <Pressable
                onPress={() => updateSettings({ fontScale: Math.min(1.6, Number((settings.fontScale + 0.1).toFixed(1))) })}
                style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
                <ThemedText type="small">+</ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Smaller — Larger
            </ThemedText>
          </ThemedView>
        </Section>

        <Section title="Developer">
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.specRow}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Developer mode</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Show Server tab and developer features.
                </ThemedText>
              </View>
              <Switch
                value={settings.devMode}
                onValueChange={(v) => { updateSettings({ devMode: v }); }}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={theme.backgroundElement}
              />
            </View>
          </ThemedView>
        </Section>

        {/* Inference */}
        <Section title="Inference">

           <Field
            label="System prompt"
            hint="Sets how the model behaves in every new reply."
            control={
              <View style={styles.promptBlock}>
                <TextInput
                  value={systemPrompt}
                  onChangeText={setSystemPrompt}
                  multiline
                  textAlignVertical="top"
                  style={[
                    styles.promptInput,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  accessibilityLabel="System prompt"
                  maxLength={3000}
                />
                <View style={styles.promptActions}>
                  <Pressable
                    onPress={savePrompt}
                    style={({ pressed }) => [
                      styles.smallButtonSolid,
                      { backgroundColor: theme.accent },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="small" style={{ color: theme.accentText, fontWeight: '600' }}>
                      Save
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={resetPrompt}
                    style={({ pressed }) => [
                      styles.smallButton,
                      { borderColor: theme.border, borderWidth: 1 },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="small">Reset</ThemedText>
                  </Pressable>
                  {promptSaved && (
                    <ThemedText type="small" style={{ color: theme.success }}>
                      Saved
                    </ThemedText>
                  )}
                </View>
              </View>
            }
          />
          <Field
            label="Context size"
            hint="How much conversation the model can see. Larger = more memory and slower startup. Applies the next time a model loads."
            control={
              <Segmented
                options={CONTEXT_SIZES}
                value={settings.contextSize}
                onChange={(contextSize) => updateSettings({ contextSize })}
                labelFor={(v) => `${v}`}
                accessibilityLabel="Context size"
              />
            }
          />
          {needsReload && (
            <View style={[styles.inlineNote, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                Your loaded model still uses {model.loadedContextSize} tokens.
              </ThemedText>
              <Pressable
                onPress={reloadModel}
                style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="accent">
                  Reload model
                </ThemedText>
              </Pressable>
            </View>
          )}

          <Field
            label="Maximum reply length"
            hint="Cap on generated tokens per reply. Shorter replies come back faster."
            control={
              <Segmented
                options={MAX_TOKEN_CHOICES}
                value={settings.maxTokens as (typeof MAX_TOKEN_CHOICES)[number]}
                onChange={(maxTokens) => updateSettings({ maxTokens })}
                labelFor={(v) => `${v}`}
                accessibilityLabel="Maximum reply length"
              />
            }
          />

          <Field
            label={`Temperature — ${settings.temperature.toFixed(1)}`}
            hint="Higher = more creative and varied. Lower = more focused and predictable."
            control={
              <Stepper
                value={settings.temperature}
                step={0.1}
                min={0}
                max={2}
                onChange={(temperature) => updateSettings({ temperature })}
              />
            }
          />

          <Field
            label="Top-K"
            hint="How many candidate words the sampler considers per step. Lower = more focused."
            control={
              <Segmented
                options={TOP_K_CHOICES}
                value={settings.topK}
                onChange={(topK) => updateSettings({ topK })}
                labelFor={(v) => `${v}`}
                accessibilityLabel="Top-K"
              />
            }
          />

          <Field
            label={`Repetition penalty — ${settings.repeatPenalty.toFixed(1)}`}
            hint="Discourages repeating the same words. 1.0 = off."
            control={
              <Stepper
                value={settings.repeatPenalty}
                step={0.1}
                min={1}
                max={2}
                onChange={(repeatPenalty) => updateSettings({ repeatPenalty })}
              />
            }
          />

          <Field
            label="Image detail (vision models)"
            hint="How many tokens an attached photo may use. Higher = more detail, more memory. Applies the next time a model loads."
            control={
              <Segmented
                options={IMAGE_TOKEN_CHOICES}
                value={settings.imageMaxTokens}
                onChange={(imageMaxTokens) => updateSettings({ imageMaxTokens })}
                labelFor={(v) => `${v}`}
                accessibilityLabel="Image detail tokens"
              />
            }
          />

         
        </Section>

        {/* Model behavior */}
        <Section title="Model behavior">
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              {model.status === 'loaded' && model.model
                ? model.model.name
                : model.status === 'loading'
                  ? 'Loading…'
                  : 'No model loaded'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {model.status === 'loaded'
                ? `Active · context ${model.loadedContextSize ?? settings.contextSize} tokens · unload frees memory but keeps the file.`
                : model.status === 'loading'
                  ? 'Initialization runs one model at a time.'
                  : 'Load a model from the Models tab to enable chat.'}
            </ThemedText>
            {model.status === 'loaded' && (
              <ThemedText type="small" themeColor="textSecondary">
                {model.vision
                  ? 'Vision on — photo attachments are available in chat.'
                  : 'Vision off — this model only handles text.'}
              </ThemedText>
            )}
            {model.status === 'loaded' && (
              <View style={styles.inlineActions}>
                <Pressable
                  onPress={() => void unloadModel()}
                  disabled={model.generating}
                  style={({ pressed }) => [
                    styles.smallButton,
                    { borderColor: theme.border, borderWidth: 1 },
                    pressed && styles.pressed,
                    model.generating && { opacity: 0.5 },
                  ]}>
                  <ThemedText type="small">Unload model</ThemedText>
                </Pressable>
              </View>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              Larger models, longer context, and longer replies increase memory use
              and latency.
            </ThemedText>
          </ThemedView>
        </Section>

        {/* Storage and privacy */}
        <Section title="Storage & privacy">
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              Downloaded models: {formatBytes(storageBytes)}
            </ThemedText>
            <Pressable
              onPress={() => router.push('/models')}
              style={({ pressed }) => [styles.linkLike, pressed && styles.pressed]}>
              <ThemedText type="small" themeColor="accent">
                Manage models →
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={clearHistory}
              style={({ pressed }) => [styles.linkLike, pressed && styles.pressed]}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                Clear chat history…
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">
              Chat inference runs entirely on this phone — messages are never sent
              anywhere. Internet is only needed to download model files. Deleting
              chat history and deleting downloaded models are separate actions.
            </ThemedText>
          </ThemedView>
        </Section>

       

       

        {/* About */}
        <Section title="About">
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.aboutHeader}>
              <Image
                source={require('../../assets/img/icon.png')}
                style={styles.aboutIcon}
                contentFit="contain"
              />
              <View style={styles.flex}>
                <ThemedText type="smallBold">PocketOllm</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Version {Constants.expoConfig?.version ?? '1.0.5'}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              llama.rn build {BuildInfo.number || 'unknown'}
              {BuildInfo.commit ? ` · ${BuildInfo.commit.slice(0, 10)}` : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              New Architecture · On-device inference · no analytics or telemetry
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Private, offline-first AI assistant running entirely on your device.
            </ThemedText>
            <Pressable
              onPress={resetAll}
              style={({ pressed }) => [styles.linkLike, pressed && styles.pressed]}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                Reset settings…
              </ThemedText>
            </Pressable>
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

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={{ fontWeight: '600' }}>
        {value}
      </ThemedText>
    </View>
  );
}

function Field({
  label,
  hint,
  control,
}: {
  label: string;
  hint: string;
  control: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {hint}
      </ThemedText>
      {control}
    </View>
  );
}

function Stepper({
  value,
  step,
  min,
  max,
  onChange,
}: {
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10));
  return (
    <View style={styles.stepperRow}>
      <Pressable
        onPress={() => onChange(clamp(value - step))}
        accessibilityLabel="Decrease"
        style={({ pressed }) => [
          styles.stepperButton,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold">−</ThemedText>
      </Pressable>
      <View
        style={[
          styles.stepperValue,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <ThemedText type="smallBold">{value.toFixed(1)}</ThemedText>
      </View>
      <Pressable
        onPress={() => onChange(clamp(value + step))}
        accessibilityLabel="Increase"
        style={({ pressed }) => [
          styles.stepperButton,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold">+</ThemedText>
      </Pressable>
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
  section: { gap: Spacing.one },
  sectionTitle: { letterSpacing: 0.6, fontSize: 12 },
  field: { gap: Spacing.one },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  inlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.three,
  },
  inlineActions: { flexDirection: 'row' },
  promptBlock: { gap: Spacing.two },
  promptInput: {
    minHeight: 90,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    fontSize: 14,
    lineHeight: 20,
  },
  promptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  smallButton: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallButtonSolid: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkLike: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  pressed: { opacity: 0.6 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepperButton: {
    width: 44,
    height: 40,
    borderRadius: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    minWidth: 64,
    height: 40,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  aboutIcon: {
    width: 48,
    height: 48,
    borderRadius: Spacing.two,
  },
});
