export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** True while assistant message is still streaming. */
  pending?: boolean;
  /** Set when generation failed; content holds the partial text. */
  error?: string;
  /** Local URI of an attached photo (vision models). */
  imageUri?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ModelEntry {
  id: string;
  /** Upstream model organisation (Qwen, Meta, Google…); shown on cards and used by search. */
  provider: string;
  name: string;
  filename: string;
  url: string;
  repoUrl: string;
  licenseUrl: string;
  license: string;
  /** Catalogue estimate in bytes; not a guarantee. */
  approxSizeBytes: number;
  /** Trusted sha256 from the Hugging Face API; verified after download. */
  sha256: string;
  params: string;
  quant: string;
  description: string;
  /** Vision models ship a second file (the mmproj projector) that must also download. */
  vision?: boolean;
  mmproj?: {
    filename: string;
    url: string;
    /** Exact byte size from the Hugging Face API; verified after download. */
    sizeBytes: number;
    sha256: string;
  };
}

/** Pending composer attachment (one at a time). */
export type Attachment =
  | { kind: 'image'; uri: string; name: string }
  | { kind: 'file'; name: string; text: string };

export type ThemeSetting = 'system' | 'light' | 'dark';

/** Named palette from PALETTES in constants/theme.ts (keep lists in sync). */
export type ColorPalette = 'emerald' | 'indigo' | 'ocean' | 'rose' | 'amber';

export interface AppSettings {
  contextSize: 1024 | 2048 | 4096;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: 20 | 40 | 64 | 128;
  repeatPenalty: number;
  /** Max tokens per attached photo (vision models); applies on model (re)load. */
  imageMaxTokens: 256 | 512 | 1024 | 2048;
  systemPrompt: string;
  theme: ThemeSetting;
  /** Color palette applied in the current mode (light/dark variant). */
  palette: ColorPalette;
  /** Server API keys (empty = auth disabled). Clients send one as `Authorization: Bearer …` or `x-api-key`. */
  apiServerKeys: string[];
}

export interface StoredModel {
  id: string;
  filename: string;
  sizeBytes: number;
  downloadedAt: number;
  /** Vision models: projector file stored next to the main GGUF. */
  mmprojFilename?: string;
  mmprojSizeBytes?: number;
}

export type DownloadStatus =
  | { state: 'idle' }
  | {
      state: 'downloading';
      /** Bytes received in the file currently transferring. */
      received: number;
      total: number | null;
      /** Bytes from already-finished files of this download (vision = 2 files). */
      doneBytes?: number;
      stage?: 'model' | 'mmproj';
    }
  | { state: 'done' }
  | { state: 'error'; message: string }
  | { state: 'cancelled' };

export type ModelStatus = 'unloaded' | 'loading' | 'loaded' | 'error';

export interface LoadedModelInfo {
  id: string;
  name: string;
}
