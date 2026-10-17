import { ModelEntry } from '@/types';

/**
 * Central model catalogue. Add new models by appending validated metadata here —
 * nothing else needs to change for a new entry to be downloadable/loadable.
 *
 * Sizes and sha256 were read from the Hugging Face API (`?blobs=true`) on
 * 2026-10-16. Size on disk after download is measured, not trusted, from the
 * file itself; sha256 is verified after every download. Vision models list a
 * second mmproj file that is downloaded and verified the same way.
 */
export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    name: 'Qwen2.5 0.5B Instruct',
    filename: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/blob/main/LICENSE',
    approxSizeBytes: 397_808_192,
    sha256: '6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653',
    params: '0.5B',
    quant: 'Q4_K_M',
    description: 'Lightweight test model. Fastest downloads and lowest memory use.',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B Instruct',
    filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE',
    approxSizeBytes: 986_048_768,
    sha256: '1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370',
    params: '1.5B',
    quant: 'Q4_K_M',
    description: 'Stronger general chat. Needs more free memory and runs slower.',
  },
  {
    id: 'llama-3.2-1b-instruct-q4_k_m',
    name: 'Llama 3.2 1B Instruct',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF',
    license: 'Llama 3.2 Community License',
    licenseUrl: 'https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE',
    approxSizeBytes: 807_694_464,
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
    params: '1B',
    quant: 'Q4_K_M',
    description: 'Alternate compact chat model from Meta with the Llama 3.2 license.',
  },
  {
    id: 'qwen3-vl-2b-instruct-q4_k_m',
    name: 'Qwen3-VL 2B Instruct',
    filename: 'Qwen3VL-2B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct/blob/main/README.md',
    approxSizeBytes: 1_107_409_952,
    sha256: '089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae',
    params: '2B',
    quant: 'Q4_K_M',
    description:
      'Vision + text chat. Attach photos in the composer and the model can describe them.',
    vision: true,
    mmproj: {
      filename: 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf',
      url: 'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf?download=true',
      sizeBytes: 445_053_216,
      sha256: 'f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82',
    },
  },
  {
    id: 'smolvlm2-500m-video-instruct-q8_0',
    name: 'SmolVLM2 500M',
    filename: 'SmolVLM2-500M-Video-Instruct-Q8_0.gguf',
    url: 'https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main/SmolVLM2-500M-Video-Instruct-Q8_0.gguf?download=true',
    repoUrl: 'https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/blob/main/README.md',
    approxSizeBytes: 436_808_704,
    sha256: '6f67b8036b2469fcd71728702720c6b51aebd759b78137a8120733b4d66438bc',
    params: '500M',
    quant: 'Q8_0',
    description:
      'Smallest vision model — quickest download and lowest memory for trying image chat.',
    vision: true,
    mmproj: {
      filename: 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf',
      url: 'https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf?download=true',
      sizeBytes: 108_785_184,
      sha256: '921dc7e259f308e5b027111fa185efcbf33db13f6e35749ddf7f5cdb60ef520b',
    },
  },
  {
    id: 'qwen2.5-vl-3b-instruct-q4_k_m',
    name: 'Qwen2.5-VL 3B Instruct',
    filename: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF',
    license: 'Qwen Research License',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct/blob/main/LICENSE',
    approxSizeBytes: 1_929_901_408,
    sha256: 'c47e8c1f6fb3e8cff6ec58909baff16dbeffb64a5bb3b746b96e05e6334c129f',
    params: '3B',
    quant: 'Q4_K_M',
    description:
      'Stronger vision (reading text in photos, VQA). Large download — the vision adapter alone is 1.3 GB.',
    vision: true,
    mmproj: {
      filename: 'mmproj-F16.gguf',
      url: 'https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/mmproj-F16.gguf?download=true',
      sizeBytes: 1_338_428_256,
      sha256: '4c1240f514de94c81b70709b0f9a80c7e3297598ea7c83f39dc00b18ee5be60c',
    },
  },
];

/** Everything a vision model consumes on disk: main GGUF + projector. */
export function totalSizeBytes(entry: ModelEntry): number {
  return entry.approxSizeBytes + (entry.mmproj?.sizeBytes ?? 0);
}

export function getModelEntry(id: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 'B';
  for (const u of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = u;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}
