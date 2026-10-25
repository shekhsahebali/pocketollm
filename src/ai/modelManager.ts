import type { LlamaContext } from 'llama.rn';

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Platform } from 'react-native';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

import {
  createContext,
  friendlyError,
  generate as llmGenerate,
  release,
  stop as llmStop,
  type GenerateOptions,
  type GenerateOutcome,
  type LlmMessage,
} from '@/ai/llmService';
import { createStore } from '@/hooks/use-store';
import { getModelEntry } from '@/models/catalog';
import { getModelMmprojPath, getModelPath, isDownloaded } from '@/models/storage';
import { settingsStore } from '@/settings/settingsRepository';
import { LoadedModelInfo, ModelStatus } from '@/types';

if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // ignore
  }
}

export interface ModelManagerState {
  status: ModelStatus;
  model: LoadedModelInfo | null;
  /** 0–100 while loading. */
  loadProgress: number;
  /** Context size the active context was initialized with (Settings reload hint). */
  loadedContextSize: number | null;
  /** True when the loaded model's vision projector started successfully. */
  vision: boolean;
  generating: boolean;
  error: string | null;
  notification: { text: string; type: 'info' | 'success' } | null;
}

const initialState: ModelManagerState = {
  status: 'unloaded',
  model: null,
  loadProgress: 0,
  loadedContextSize: null,
  vision: false,
  generating: false,
  error: null,
  notification: null,
};

export const modelStore = createStore<ModelManagerState>(initialState);

function patch(partial: Partial<ModelManagerState>): void {
  modelStore.set({ ...modelStore.get(), ...partial });
}

export function clearNotification(): void {
  patch({ notification: null });
}

let context: LlamaContext | null = null;

async function showSystemNotification(title: string, body: string): Promise<void> {
  if (!Notifications) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('model', {
        name: 'Model',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const res = await Notifications.requestPermissionsAsync();
      if (res.status !== 'granted') return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: false,
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
}

/**
 * All lifecycle operations (load / unload / generate) run through one queue
 * so a single native context is never used or created concurrently.
 */
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getLoadedContext(): LlamaContext | null {
  return context;
}

export function isModelLoaded(): boolean {
  return modelStore.get().status === 'loaded' && context !== null;
}

/**
 * Loads a downloaded model. Releases any previously loaded context first.
 * On failure the state is a consistent "no model" + error — never a stale
 * "loaded" state pointing at the old model.
 */
export function loadModel(id: string): Promise<void> {
  return enqueue(async () => {
    // Keep the CPU awake so a load isn't sleep-throttled mid-way (user toggle).
    if (settingsStore.get().backgroundRunning) {
      try {
        await activateKeepAwakeAsync('inference');
      } catch {
        /* unavailable platform — carry on without the wake lock */
      }
    }
    try {
      await loadModelInner(id);
    } finally {
      deactivateKeepAwake('inference');
    }
  });
}

async function loadModelInner(id: string): Promise<void> {
  patch({ status: 'loading', loadProgress: 0, error: null, model: null, vision: false });

    if (context) {
      try {
        await release(context);
      } catch {
        /* releasing a broken context must not block loading the next one */
      }
      context = null;
    }

    if (!isDownloaded(id)) {
      patch({
        status: 'unloaded',
        error: 'Model file is missing. Download it again from the Models screen.',
      });
      return;
    }
    const path = getModelPath(id);
    const entry = getModelEntry(id);
    if (!path || !entry) {
      patch({
        status: 'unloaded',
        error: 'Model file is missing. Download it again from the Models screen.',
      });
      return;
    }

    const nCtx = settingsStore.get().contextSize;
    const mmprojPath = entry.mmproj ? getModelMmprojPath(id) : null;
    try {
      const created = await createContext(
        path,
        nCtx,
        (percent) => {
          patch({ loadProgress: Math.max(0, Math.min(100, Math.round(percent))) });
        },
        mmprojPath ? { mmprojPath, imageMaxTokens: settingsStore.get().imageMaxTokens } : undefined,
      );
      context = created.context;
      const gpuMode = settingsStore.get().gpuMode ?? 'auto';
      const backend = gpuMode === 'cpu' ? 'CPU' : 'GPU';
      patch({
        status: 'loaded',
        model: { id, name: entry.name },
        loadProgress: 100,
        loadedContextSize: nCtx,
        vision: created.visionOk,
        notification: { text: `${entry.name} loaded (${backend})`, type: 'success' },
        // Vision models that fail projector init still chat — with a clear warning.
        error:
          entry.mmproj && !created.visionOk
            ? 'Vision could not start — image attachments are off, text chat works. Try deleting and re-downloading the model.'
            : null,
      });
      void showSystemNotification('PocketOllm', `${entry.name} loaded (${backend})`);
    } catch (e) {
      context = null;
      patch({
        status: 'unloaded',
        model: null,
        loadProgress: 0,
        loadedContextSize: null,
        vision: false,
        error: friendlyError(e, 'Could not load the model.'),
      });
    }
}

/** Frees runtime resources. The file stays on disk. */
export function unloadModel(): Promise<void> {
  return enqueue(async () => {
    const current = modelStore.get();
    const name = current.model?.name;
    if (context) {
      try {
        await release(context);
      } catch (e) {
        patch({ error: friendlyError(e, 'Unloading failed.') });
      }
      context = null;
    }
    patch({
      status: 'unloaded',
      model: null,
      loadProgress: 0,
      loadedContextSize: null,
      vision: false,
      generating: false,
      notification: name ? { text: `${name} unloaded`, type: 'info' } : { text: 'Model unloaded', type: 'info' },
    });
    void showSystemNotification('PocketOllm', name ? `${name} unloaded` : 'Model unloaded');
  });
}

/** Runs one inference over the given message history (queued). */
export function runCompletion(
  messages: LlmMessage[],
  options: GenerateOptions,
  onPartial: (text: string) => void,
): Promise<GenerateOutcome> {
  return enqueue(async () => {
    if (!context || modelStore.get().status !== 'loaded') {
      throw new Error('No model is loaded. Download or load a model first.');
    }
    patch({ generating: true });
    const wake = settingsStore.get().backgroundRunning;
    try {
      if (wake) {
        try {
          await activateKeepAwakeAsync('inference');
        } catch {
          /* unavailable platform — carry on without the wake lock */
        }
      }
      return await llmGenerate(context, messages, options, onPartial);
    } finally {
      // Deactivating a tag that was never activated is a native no-op.
      if (wake) deactivateKeepAwake('inference');
      patch({ generating: false });
    }
  });
}

/**
 * Stops the in-flight generation. Deliberately NOT queued: it must be able
 * to interrupt a completion that is already running.
 */
export function stopGeneration(): void {
  const ctx = context;
  if (ctx) void llmStop(ctx).catch(() => {});
}
