import {
  initLlama,
  loadLlamaModelInfo,
  type LlamaContext,
  type NativeCompletionResult,
  type RNLlamaOAICompatibleMessage,
} from 'llama.rn';

export type LlmMessage = RNLlamaOAICompatibleMessage;

export interface GenerateOptions {
  nPredict: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
}

/** Vision projector wiring for a multimodal model. */
export interface VisionConfig {
  mmprojPath: string;
  imageMaxTokens: number;
}

export interface CreatedContext {
  context: LlamaContext;
  /** False when the projector failed to start — text chat still works. */
  visionOk: boolean;
}

export interface GenerateOutcome {
  /** Final assistant text (reasoning/tool content stripped when available). */
  text: string;
  /** True when the completion was stopped early via stopCompletion(). */
  interrupted: boolean;
  tokensPredicted: number;
}

/**
 * Thin typed wrapper over llama.rn. UI code never touches native runtime
 * objects directly — modelManager owns contexts and calls these.
 */
export async function createContext(
  modelPath: string,
  nCtx: number,
  onProgress?: (percent: number) => void,
  vision?: VisionConfig,
): Promise<CreatedContext> {
  const context = await initLlama(
    {
      model: modelPath,
      n_ctx: nCtx,
      n_gpu_layers: 0, // CPU-first; GPU/NPU offload is not enabled in this build
      // Multimodal prompts can exceed the context once image tokens are added;
      // llama.rn docs require ctx_shift off for vision models.
      ...(vision ? { ctx_shift: false } : {}),
    },
    onProgress,
  );
  if (!vision) return { context, visionOk: false };
  try {
    const ok = await context.initMultimodal({
      path: vision.mmprojPath,
      use_gpu: false, // CPU-first build; projector runs on CPU like the LLM
      image_max_tokens: vision.imageMaxTokens,
    });
    return { context, visionOk: ok };
  } catch {
    // Projector failed to load (e.g. unsupported arch) — degrade to text-only.
    return { context, visionOk: false };
  }
}

export async function generate(
  context: LlamaContext,
  messages: LlmMessage[],
  options: GenerateOptions,
  onPartial: (accumulatedText: string) => void,
): Promise<GenerateOutcome> {
  let accumulated = '';
  const result: NativeCompletionResult = await context.completion(
    {
      messages,
      n_predict: options.nPredict,
      temperature: options.temperature,
      top_p: options.topP,
      top_k: options.topK,
      penalty_repeat: options.repeatPenalty,
      // 'none' (the llama.rn default) leaves thinking mixed into the answer
      // for reasoning models; 'auto' parses it into reasoning_content.
      reasoning_format: 'auto',
    },
    (data) => {
      // content is the parser-separated answer (thinking stripped); fall back
      // to raw accumulation when the template can't be split.
      if (typeof data.content === 'string') {
        accumulated = data.content;
      } else if (typeof data.accumulated_text === 'string') {
        accumulated = data.accumulated_text;
      } else if (data.token) {
        accumulated += data.token;
      }
      onPartial(accumulated);
    },
  );
  const text = result.content || result.text || accumulated;
  if (text) onPartial(text);
  return {
    text,
    interrupted: result.interrupted,
    tokensPredicted: result.tokens_predicted,
  };
}

/** Stops a completion that is currently running on this context. */
export function stop(context: LlamaContext): Promise<void> {
  return context.stopCompletion();
}

export async function release(context: LlamaContext): Promise<void> {
  try {
    await context.releaseMultimodal();
  } catch {
    // Not initialized, or already gone — never blocks releasing the context.
  }
  return context.release();
}

/** Reads GGUF metadata from a local file for diagnostics. */
export function readModelInfo(modelPath: string): Promise<Record<string, unknown>> {
  return loadLlamaModelInfo(modelPath) as Promise<Record<string, unknown>>;
}

/** True if the error looks like a native memory allocation failure. */
export function isMemoryError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /out of memory|bad_alloc|failed to allocate|oom|cannot allocate/i.test(msg);
}

export function friendlyError(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (!msg) return fallback;
  if (isMemoryError(error)) {
    return 'The model ran out of memory. Try unloading it, a smaller model, or a smaller context size in Settings.';
  }
  if (/invalid|gguf|magic|header/i.test(msg)) {
    return 'This file does not look like a valid GGUF model. Delete it from the Models screen and download it again.';
  }
  // Keep native messages short and single-line for the UI.
  return msg.split('\n')[0].slice(0, 240);
}
