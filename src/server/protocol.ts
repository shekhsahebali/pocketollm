/**
 * Pure HTTP/1.1 request parsing and OpenAI/Anthropic payload mapping for the
 * local /v1 API server. No React Native imports — checked by selfcheck.ts.
 */
import type { LlmMessage } from '@/ai/llmService';

/** Largest request body we accept (chat payloads are text; 256 KB is generous). */
export const MAX_BODY_BYTES = 256 * 1024;
/** Largest header block in characters (HTTP headers are ASCII). */
export const MAX_HEADER_CHARS = 16 * 1024;

export class RequestError extends Error {
  // Plain fields, not constructor parameter properties — node's strip-only
  // mode (selfcheck) rejects parameter properties.
  readonly status: number;
  readonly type: 'invalid_request_error' | 'unsupported' | 'server_error';
  constructor(
    message: string,
    status: number,
    type: 'invalid_request_error' | 'unsupported' | 'server_error' = 'invalid_request_error',
  ) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

export interface ParsedRequest {
  method: string;
  /** Target with the query string stripped. */
  path: string;
  /** Header names lowercased; last occurrence wins. */
  headers: Record<string, string>;
  body: string;
}

/** UTF-8 byte length of a string. */
export function utf8Bytes(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i) ?? 0xfffd;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (cp > 0xffff) i++; // surrogate pair consumes a second code unit
  }
  return bytes;
}

/** Next `byteLen` bytes of s starting at `from` as a string; null while incomplete. */
function sliceUtf8(s: string, from: number, byteLen: number): string | null {
  if (byteLen === 0) return '';
  let bytes = 0;
  let i = from;
  while (i < s.length) {
    const cp = s.codePointAt(i) ?? 0xfffd;
    const n = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (bytes + n > byteLen) break; // Content-Length cut a char in half → short body, JSON will reject
    bytes += n;
    i += cp > 0xffff ? 2 : 1;
    if (bytes === byteLen) return s.slice(from, i);
  }
  return null; // need more bytes
}

/**
 * Parses one complete request. Returns null while the body is still arriving;
 * throws RequestError (with HTTP status) for malformed/oversized requests.
 * One request per connection (Connection: close), so no pipelining handling.
 */
export function parseHttpRequest(raw: string): ParsedRequest | null {
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd < 0) {
    if (raw.length > MAX_HEADER_CHARS) {
      throw new RequestError('Request headers too large.', 431);
    }
    return null;
  }
  if (headerEnd > MAX_HEADER_CHARS) {
    throw new RequestError('Request headers too large.', 431);
  }
  const lines = raw.slice(0, headerEnd).split('\r\n');
  const requestLine = (lines[0] ?? '').split(' ');
  if (
    requestLine.length !== 3 ||
    !/^[A-Z]+$/.test(requestLine[0]) ||
    !requestLine[1].startsWith('/') ||
    !requestLine[2].startsWith('HTTP/')
  ) {
    throw new RequestError('Malformed request line.', 400);
  }
  const method = requestLine[0];
  const target = requestLine[1];

  let contentLength: number | null = null;
  let chunked = false;
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const colon = lines[i].indexOf(':');
    if (colon <= 0) throw new RequestError('Malformed header line.', 400);
    const name = lines[i].slice(0, colon).trim().toLowerCase();
    const value = lines[i].slice(colon + 1).trim();
    headers[name] = value;
    if (name === 'content-length') {
      if (!/^\d+$/.test(value)) throw new RequestError('Invalid Content-Length.', 400);
      const n = Number(value);
      if (contentLength !== null && contentLength !== n) {
        throw new RequestError('Conflicting Content-Length headers.', 400);
      }
      contentLength = n;
    } else if (name === 'transfer-encoding' && value.toLowerCase().includes('chunked')) {
      chunked = true;
    }
  }
  if (chunked) throw new RequestError('Chunked request bodies are not supported.', 411);
  const bodyBytes = contentLength ?? 0;
  if (bodyBytes > MAX_BODY_BYTES) throw new RequestError('Request body too large.', 413);

  const body = sliceUtf8(raw, headerEnd + 4, bodyBytes);
  if (body === null) return null;
  return { method, path: target.split('?')[0] ?? '/', headers, body };
}

/**
 * True when the request carries any of the configured keys (`Authorization:
 * Bearer …`, `x-api-key`, or `api-key`). Empty `expected` disables auth.
 */
export function apiKeyMatches(headers: Record<string, string>, expected: string[]): boolean {
  if (expected.length === 0) return true;
  const raw =
    headers.authorization ?? headers['x-api-key'] ?? headers['api-key'] ?? '';
  const got = raw.replace(/^bearer\s+/i, '');
  // Length-mismatch short-circuit is standard practice; content compare is
  // JS-inevitably timing-variable either way — acceptable for a LAN server.
  return expected.some((k) => got.length === k.length && got === k);
}

export function parseJsonBody(body: string): Record<string, unknown> {
  if (!body.trim()) throw new RequestError('Request body must be JSON.', 400);
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new RequestError('Request body is not valid JSON.', 400);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('Request body must be a JSON object.', 400);
  }
  return data as Record<string, unknown>;
}

function openAiPartsToText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    throw new RequestError('Message content must be a string or an array of parts.', 400);
  }
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) throw new RequestError('Invalid content part.', 400);
    const p = part as Record<string, unknown>;
    if (p.type === 'text' && typeof p.text === 'string') {
      out.push(p.text);
    } else if (p.type === 'image_url' || p.type === 'image') {
      throw new RequestError('Image content is not supported over the API yet.', 400, 'unsupported');
    } else {
      throw new RequestError(`Unsupported content part type: ${String(p.type)}.`, 400);
    }
  }
  return out.join('');
}

const OPENAI_ROLES = new Set(['system', 'user', 'assistant']);

/** Validates an OpenAI `messages` array into llama.rn message shape. */
export function openAiMessagesToLlm(raw: unknown): LlmMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RequestError('`messages` must be a non-empty array.', 400);
  }
  return raw.map((m) => {
    if (typeof m !== 'object' || m === null) throw new RequestError('Invalid message.', 400);
    const msg = m as Record<string, unknown>;
    if (typeof msg.role !== 'string' || !OPENAI_ROLES.has(msg.role)) {
      throw new RequestError(`Unsupported role: ${String(msg.role)}.`, 400);
    }
    const content =
      msg.content === null || msg.content === undefined
        ? ''
        : typeof msg.content === 'string'
          ? msg.content
          : openAiPartsToText(msg.content);
    return { role: msg.role as 'system' | 'user' | 'assistant', content };
  });
}

function anthropicPartsToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) {
    throw new RequestError('Message content must be a string or an array of blocks.', 400);
  }
  const out: string[] = [];
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) throw new RequestError('Invalid content block.', 400);
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      out.push(b.text);
    } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
      // Round-tripped thinking blocks from a prior turn — safe to drop.
    } else if (b.type === 'image') {
      throw new RequestError('Image content is not supported over the API yet.', 400, 'unsupported');
    } else {
      throw new RequestError(
        `Unsupported content block type: ${String(b.type)} — this server has no tool support yet.`,
        400,
      );
    }
  }
  return out.join('');
}

/** Validates Anthropic `system` + `messages` into llama.rn message shape. */
export function anthropicMessagesToLlm(system: unknown, raw: unknown): LlmMessage[] {
  const out: LlmMessage[] = [];
  let systemText = '';
  if (typeof system === 'string') systemText = system;
  else if (Array.isArray(system)) systemText = anthropicPartsToText(system);
  else if (system !== null && system !== undefined) {
    throw new RequestError('`system` must be a string or an array of text blocks.', 400);
  }
  if (systemText) out.push({ role: 'system', content: systemText });

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RequestError('`messages` must be a non-empty array.', 400);
  }
  for (const m of raw) {
    if (typeof m !== 'object' || m === null) throw new RequestError('Invalid message.', 400);
    const msg = m as Record<string, unknown>;
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      throw new RequestError(`Unsupported role: ${String(msg.role)}.`, 400);
    }
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : msg.content === null || msg.content === undefined
          ? ''
          : anthropicPartsToText(msg.content);
    out.push({ role: msg.role, content });
  }
  return out;
}

export function clampInt(value: unknown, min: number, max: number, dflt: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return dflt;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampNum(value: unknown, min: number, max: number, dflt: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return dflt;
  return Math.min(max, Math.max(min, value));
}

let idSeq = 0;
export function makeId(prefix: string): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}${idSeq.toString(36)}`;
}

export interface FinishInfo {
  /** Real loaded model id — never the client's requested model name. */
  model: string;
  finish: 'stop' | 'length';
  inputTokens: number;
  outputTokens: number;
}

export function openAiCompletion(text: string, info: FinishInfo): Record<string, unknown> {
  return {
    id: makeId('chatcmpl-'),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: info.model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: info.finish }],
    usage: {
      prompt_tokens: info.inputTokens,
      completion_tokens: info.outputTokens,
      total_tokens: info.inputTokens + info.outputTokens,
    },
  };
}

export function openAiChunk(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finish: 'stop' | 'length' | null,
): Record<string, unknown> {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

export function anthropicMessage(
  text: string,
  info: FinishInfo,
): Record<string, unknown> {
  return {
    id: makeId('msg_'),
    type: 'message',
    role: 'assistant',
    model: info.model,
    content: [{ type: 'text', text }],
    stop_reason: info.finish === 'length' ? 'max_tokens' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: info.inputTokens, output_tokens: info.outputTokens },
  };
}

/** One SSE frame: `event:` + `data:` lines for the Anthropic streaming protocol. */
export function anthropicEvent(type: string, payload: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
}

// --- OpenAI Responses API (/v1/responses) -----------------------------------

function responsesPartsToText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    throw new RequestError('Input content must be a string or an array of parts.', 400);
  }
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) throw new RequestError('Invalid content part.', 400);
    const p = part as Record<string, unknown>;
    if (
      (p.type === 'input_text' || p.type === 'output_text' || p.type === 'text') &&
      typeof p.text === 'string'
    ) {
      out.push(p.text);
    } else if (p.type === 'input_image' || p.type === 'image_url' || p.type === 'image') {
      throw new RequestError('Image content is not supported over the API yet.', 400, 'unsupported');
    } else {
      throw new RequestError(`Unsupported input part type: ${String(p.type)}.`, 400);
    }
  }
  return out.join('');
}

/** Validates OpenAI Responses `input` (string or message items) + `instructions`. */
export function responsesInputToLlm(input: unknown, instructions: unknown): LlmMessage[] {
  const out: LlmMessage[] = [];
  if (typeof instructions === 'string' && instructions.trim()) {
    out.push({ role: 'system', content: instructions });
  }
  if (typeof input === 'string') {
    out.push({ role: 'user', content: input });
    return out;
  }
  if (!Array.isArray(input) || input.length === 0) {
    throw new RequestError('`input` must be a string or a non-empty array.', 400);
  }
  for (const item of input) {
    if (typeof item !== 'object' || item === null) throw new RequestError('Invalid input item.', 400);
    const it = item as Record<string, unknown>;
    if (typeof it.role !== 'string' || !OPENAI_ROLES.has(it.role)) {
      throw new RequestError(`Unsupported input role: ${String(it.role)}.`, 400);
    }
    const content =
      typeof it.content === 'string'
        ? it.content
        : it.content === null || it.content === undefined
          ? ''
          : responsesPartsToText(it.content);
    out.push({ role: it.role as 'system' | 'user' | 'assistant', content });
  }
  return out;
}

/** Assistant-message item shared by Responses output and stream events. */
export function responsesMessageItem(id: string, text: string): Record<string, unknown> {
  return {
    type: 'message',
    id,
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }],
  };
}

/** Non-streaming OpenAI Responses API body. */
export function responsesCompletion(text: string, info: FinishInfo): Record<string, unknown> {
  return {
    id: makeId('resp_'),
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: info.model,
    output: [responsesMessageItem(makeId('msg_'), text)],
    usage: {
      input_tokens: info.inputTokens,
      output_tokens: info.outputTokens,
      total_tokens: info.inputTokens + info.outputTokens,
    },
  };
}

/** One SSE frame for the OpenAI Responses streaming protocol. */
export function responsesEvent(type: string, payload: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
}

// --- Legacy OpenAI Completions API (/v1/completions) ------------------------

/** Validates a legacy `prompt` (string or string array) into one user message. */
export function completionsPromptToLlm(prompt: unknown): LlmMessage[] {
  // ponytail: the prompt is wrapped as a chat turn because context.completion()'s
  // public typed API is messages-only (raw `prompt` is Omitted). Upgrade: a
  // raw-prompt path in llmService if llama.rn ever types it.
  const text =
    typeof prompt === 'string'
      ? prompt
      : Array.isArray(prompt) && typeof prompt[0] === 'string'
        ? prompt[0]
        : null;
  if (text === null) {
    throw new RequestError(
      '`prompt` must be a string (or a string array; only the first item is used).',
      400,
    );
  }
  return [{ role: 'user', content: text }];
}

/** Non-streaming legacy text_completion body. */
export function completionsCompletion(text: string, info: FinishInfo): Record<string, unknown> {
  return {
    id: makeId('cmpl-'),
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: info.model,
    choices: [{ text, index: 0, logprobs: null, finish_reason: info.finish }],
    usage: {
      prompt_tokens: info.inputTokens,
      completion_tokens: info.outputTokens,
      total_tokens: info.inputTokens + info.outputTokens,
    },
  };
}

/** One text_completion chunk for legacy `stream: true`. */
export function completionsChunk(
  id: string,
  model: string,
  text: string,
  finish: 'stop' | 'length' | null,
): Record<string, unknown> {
  return {
    id,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ text, index: 0, logprobs: null, finish_reason: finish }],
  };
}

export function errorBody(kind: 'openai' | 'anthropic', type: string, message: string): string {
  return JSON.stringify(
    kind === 'anthropic'
      ? { type: 'error', error: { type, message } }
      : { error: { message, type, param: null, code: null } },
  );
}
