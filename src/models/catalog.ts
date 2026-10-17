import type { ModelEntry } from '@/types';

/**
 * Central model catalogue. Add new models by appending validated metadata here —
 * nothing else needs to change for a new entry to be downloadable/loadable.
 *
 * Sizes and sha256 were read from the Hugging Face API (`?blobs=true`) /
 * resolve-URL ETags on 2026-10-16/17. Size on disk after download is measured,
 * not trusted, from the file itself; sha256 is verified after every download.
 * Vision models list a second mmproj file that is downloaded and verified the same way.
 */
export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    provider: 'Qwen',
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
    provider: 'Qwen',
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
    id: 'gemma-4-e2b-it-ultra-uncensored-heretic-gguf',
    provider: 'Google',
    name: 'Gemma 4 E2B It Ultra Uncensored Heretic',
    filename: 'gemma-4-E2B-it-ultra-uncensored-heretic-Q4_K_M.gguf',
    url: 'https://huggingface.co/llmfan46/gemma-4-E2B-it-ultra-uncensored-heretic-GGUF/resolve/main/gemma-4-E2B-it-ultra-uncensored-heretic-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/llmfan46/gemma-4-E2B-it-ultra-uncensored-heretic-GGUF',
    license: 'Apache-2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    approxSizeBytes: 3_427_879_136,
    sha256: 'b458a896b652de933a587a660c21a4b2516f936934db328ae44bbad7a4518ac5',
    params: '2.3B',
    quant: 'Q4_K_M',
    vision: true,
    mmproj: {
      filename: 'gemma-4-E2B-it-mmproj-BF16.gguf',
      url: 'https://huggingface.co/llmfan46/gemma-4-E2B-it-ultra-uncensored-heretic-GGUF/resolve/main/gemma-4-E2B-it-mmproj-BF16.gguf?download=true',
      sizeBytes: 986_833_408,
      sha256: 'd460bb51ce5115232a723a7366694c8ee70d8aa8f60159d182a1da0777d10db3',
    },
    description: 'Gemma 4 E2B It Ultra Uncensored Heretic is a powerful and versatile language model designed for a wide range of natural language processing tasks. It is built on the Gemma architecture and has been fine-tuned for various applications, including text generation, summarization, and question answering. The model is uncensored, allowing for more open-ended and creative responses, making it suitable for research and experimentation in AI-driven language understanding.',
  },
  {
    id: 'llama-3.2-1b-instruct-q4_k_m',
    provider: 'Meta',
    name: 'Llama 3.2 1B Instruct',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF',
    license: 'Llama 3.2 Community License',
    licenseUrl: 'https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt',
    approxSizeBytes: 807_694_464,
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
    params: '1B',
    quant: 'Q4_K_M',
    description: 'Alternate compact chat model from Meta with the Llama 3.2 license.',
  },
  {
    id: 'qwen3-vl-2b-instruct-q4_k_m',
    provider: 'Qwen',
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
    provider: 'Hugging Face',
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
    provider: 'Qwen',
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
  {
    id: 'qwen3-4b-q4_k_m',
    provider: 'Qwen',
    name: 'Qwen3 4B',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-4B/blob/main/LICENSE',
    approxSizeBytes: 2_497_280_256,
    sha256: '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',
    params: '4B',
    quant: 'Q4_K_M',
    description:
      'Newest Qwen generation with built-in reasoning. Strong quality for its size and memory.',
  },
  {
    id: 'gemma-3-4b-it-q4_k_m',
    provider: 'Google',
    name: 'Gemma 3 4B',
    filename: 'gemma-3-4b-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF',
    license: 'Gemma Terms of Use',
    licenseUrl: 'https://ai.google.dev/gemma/terms',
    approxSizeBytes: 2_489_757_856,
    sha256: '882e8d2db44dc554fb0ea5077cb7e4bc49e7342a1f0da57901c0802ea21a0863',
    params: '4B',
    quant: 'Q4_K_M',
    description:
      'Google’s Gemma 3 — text + image chat with strong general knowledge. Projector adds ~850 MB.',
    vision: true,
    mmproj: {
      filename: 'mmproj-model-f16.gguf',
      url: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/mmproj-model-f16.gguf?download=true',
      sizeBytes: 851_251_104,
      sha256: '8c0fb064b019a6972856aaae2c7e4792858af3ca4561be2dbf649123ba6c40cb',
    },
  },
  {
    id: 'phi-3.5-mini-instruct-q4_k_m',
    provider: 'Microsoft',
    name: 'Phi-3.5 Mini Instruct',
    filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF',
    license: 'MIT',
    licenseUrl: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct/blob/main/LICENSE',
    approxSizeBytes: 2_393_232_672,
    sha256: 'e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5',
    params: '3.8B',
    quant: 'Q4_K_M',
    description:
      'Microsoft’s small-but-mighty Phi, tuned for reasoning and code at a comfortable memory size.',
  },
  {
    id: 'llama-3.2-3b-instruct-q4_k_m',
    provider: 'Meta',
    name: 'Llama 3.2 3B Instruct',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
    license: 'Llama 3.2 Community License',
    licenseUrl: 'https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct/blob/main/LICENSE.txt',
    approxSizeBytes: 2_019_377_696,
    sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
    params: '3B',
    quant: 'Q4_K_M',
    description:
      'Meta’s 3B — the strongest small Llama; noticeably better replies than the 1B at a moderate cost.',
  },
  {
    id: 'mistral-7b-instruct-v0.3-q4_k_m',
    provider: 'Mistral AI',
    name: 'Mistral 7B Instruct v0.3',
    filename: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF',
    license: 'Apache-2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    approxSizeBytes: 4_372_812_000,
    sha256: '1270d22c0fbb3d092fb725d4d96c457b7b687a5f5a715abe1e818da303e562b6',
    params: '7B',
    quant: 'Q4_K_M',
    description:
      'Classic 7B workhorse from Mistral AI. Large download and memory — best on 8 GB devices.',
  },
  {
    id: 'deepseek-r1-distill-qwen-7b-q4_k_m',
    provider: 'DeepSeek',
    name: 'DeepSeek R1 Distill 7B',
    filename: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf?download=true',
    repoUrl: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF',
    license: 'MIT',
    licenseUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B/blob/main/LICENSE',
    approxSizeBytes: 4_683_073_504,
    sha256: '731ece8d06dc7eda6f6572997feb9ee1258db0784827e642909d9b565641937b',
    params: '7B',
    quant: 'Q4_K_M',
    description:
      'Reasoning model — thinks step by step, so replies are slower and longer. Heaviest file in the list.',
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
