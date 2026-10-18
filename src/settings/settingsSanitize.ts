import type { AppSettings } from '@/types';

export const DEFAULT_SETTINGS: AppSettings = {
  contextSize: 2048,
  maxTokens: 256,
  temperature: 0.7,
  topP: 0.9,
  topK: 40, // llama.rn native default — keeps V1 sampling behaviour
  repeatPenalty: 1.0, // llama.rn native default
  imageMaxTokens: 1024,
  systemPrompt:
    'You are a helpful, concise assistant running entirely on the user\'s phone.',
  theme: 'system',
  apiServerKeys: [],
};

const CONTEXT_SIZES = [1024, 2048, 4096];
const TOP_K_CHOICES = [20, 40, 64, 128];
const IMAGE_TOKEN_CHOICES = [256, 512, 1024, 2048];

/** Merge saved settings over defaults, dropping invalid/corrupted values. */
export function sanitize(raw: unknown): AppSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  if (CONTEXT_SIZES.includes(r.contextSize as number)) {
    out.contextSize = r.contextSize as AppSettings['contextSize'];
  }
  const maxTokens = r.maxTokens;
  if (typeof maxTokens === 'number' && maxTokens >= 64 && maxTokens <= 2048) {
    // Snap to the nearest offered choice so a segmented control always shows a selection.
    const choices = [128, 256, 512, 1024];
    out.maxTokens = choices.reduce((best, c) =>
      Math.abs(c - maxTokens) < Math.abs(best - maxTokens) ? c : best,
    );
  }
  if (typeof r.temperature === 'number' && r.temperature >= 0 && r.temperature <= 2) {
    out.temperature = r.temperature;
  }
  if (typeof r.topP === 'number' && r.topP > 0 && r.topP <= 1) {
    out.topP = r.topP;
  }
  if (TOP_K_CHOICES.includes(r.topK as number)) {
    out.topK = r.topK as AppSettings['topK'];
  }
  if (typeof r.repeatPenalty === 'number' && r.repeatPenalty >= 1 && r.repeatPenalty <= 2) {
    out.repeatPenalty = Math.round(r.repeatPenalty * 10) / 10;
  }
  if (IMAGE_TOKEN_CHOICES.includes(r.imageMaxTokens as number)) {
    out.imageMaxTokens = r.imageMaxTokens as AppSettings['imageMaxTokens'];
  }
  if (typeof r.systemPrompt === 'string' && r.systemPrompt.length < 4000) {
    out.systemPrompt = r.systemPrompt;
  }
  if (r.theme === 'system' || r.theme === 'light' || r.theme === 'dark') {
    out.theme = r.theme;
  }
  out.apiServerKeys = sanitizeApiKeys(r);
  return out;
}

const MAX_API_KEYS = 8;

/** Valid, de-duplicated key list; migrates the pre-multi-key `apiServerKey` field. */
function sanitizeApiKeys(r: Record<string, unknown>): string[] {
  const list: unknown[] = Array.isArray(r.apiServerKeys) ? [...r.apiServerKeys] : [];
  // legacy single-key format from before multi-key support
  if (typeof r.apiServerKey === 'string' && r.apiServerKey) list.unshift(r.apiServerKey);
  const out: string[] = [];
  for (const k of list) {
    if (typeof k !== 'string') continue;
    const key = k.trim();
    if (key.length < 8 || key.length > 120) continue;
    if (!out.includes(key)) out.push(key);
    if (out.length >= MAX_API_KEYS) break;
  }
  return out;
}
