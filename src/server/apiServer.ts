import { getLoadedContext, isModelLoaded, modelStore, runCompletion } from '@/ai/modelManager';
import type { GenerateOptions } from '@/ai/llmService';
import { createStore } from '@/hooks/use-store';
import { getModelEntry } from '@/models/catalog';
import { modelsStore } from '@/models/storage';
import { settingsStore } from '@/settings/settingsRepository';
import {
  apiKeyMatches,
  anthropicEvent,
  anthropicMessage,
  anthropicMessagesToLlm,
  clampInt,
  clampNum,
  completionsChunk,
  completionsCompletion,
  completionsPromptToLlm,
  errorBody,
  makeId,
  openAiChunk,
  openAiCompletion,
  openAiMessagesToLlm,
  parseHttpRequest,
  parseJsonBody,
  RequestError,
  responsesCompletion,
  responsesEvent,
  responsesInputToLlm,
  responsesMessageItem,
  utf8Bytes,
  type FinishInfo,
  type ParsedRequest,
} from '@/server/protocol';
import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';

/** Fixed listen port; shown on the Server screen as part of the endpoint URL. */
export const API_PORT = 8080;

export interface ApiServerState {
  status: 'stopped' | 'starting' | 'running' | 'error';
  error: string | null;
}

export const apiServerStore = createStore<ApiServerState>({ status: 'stopped', error: null });

let server: TcpSocket.Server | null = null;
const openSockets = new Set<TcpSocket.Socket>();

function patch(partial: Partial<ApiServerState>): void {
  apiServerStore.set({ ...apiServerStore.get(), ...partial });
}

export function startServer(): void {
  const status = apiServerStore.get().status;
  if (status === 'running' || status === 'starting') return;
  patch({ status: 'starting', error: null });
  try {
    const srv = TcpSocket.createServer((socket) => handleConnection(socket));
    srv.on('listening', () => patch({ status: 'running', error: null }));
    srv.on('error', (err: Error) => {
      if (server === srv) server = null;
      patch({
        status: 'error',
        error: /address|bind|in use/i.test(err.message)
          ? `Port ${API_PORT} is already in use. Stop the other server and try again.`
          : err.message.slice(0, 200),
      });
    });
    srv.listen({ port: API_PORT, host: '0.0.0.0' });
    server = srv;
  } catch (e) {
    server = null;
    patch({ status: 'error', error: e instanceof Error ? e.message.slice(0, 200) : 'Start failed.' });
  }
}

export function stopServer(): void {
  const srv = server;
  server = null;
  for (const socket of openSockets) {
    try {
      socket.destroy();
    } catch {
      /* socket already gone */
    }
  }
  openSockets.clear();
  if (srv) {
    try {
      srv.close();
    } catch {
      /* already closed */
    }
  }
  patch({ status: 'stopped', error: null });
}

// --- connection / request handling -----------------------------------------

function handleConnection(socket: TcpSocket.Socket): void {
  openSockets.add(socket);
  // Raw Buffer chunks, decoded once per request: per-chunk setEncoding('utf8')
  // corrupts a multibyte char split across TCP packets (→ JSON 400s).
  const chunks: Buffer[] = [];
  let handled = false;
  socket.on('error', () => {
    openSockets.delete(socket);
    try {
      socket.destroy();
    } catch {
      /* already gone */
    }
  });
  socket.on('close', () => openSockets.delete(socket));
  socket.on('data', (chunk: unknown) => {
    if (handled) return;
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    let req: ParsedRequest | null;
    try {
      req = parseHttpRequest(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      handled = true;
      sendError(socket, '/v1', e);
      return;
    }
    if (!req) return; // body still arriving
    handled = true;
    chunks.length = 0;
    void route(socket, req);
  });
}

function sendRaw(socket: TcpSocket.Socket, payload: string): void {
  if (socket.destroyed) return;
  try {
    // end(payload) runs the native close only after this write's completion
    // callback. write() + end() race two native executors (writeExecutor vs
    // module destroy) and intermittently truncate the response.
    socket.end(payload);
  } catch {
    try {
      socket.destroy();
    } catch {
      /* already gone */
    }
  }
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  405: 'Method Not Allowed',
  411: 'Length Required',
  413: 'Payload Too Large',
  431: 'Request Header Fields Too Large',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function sendJson(
  socket: TcpSocket.Socket,
  status: number,
  bodyText: string,
  contentType = 'application/json',
): void {
  const head =
    `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? 'Error'}\r\n` +
    `Content-Type: ${contentType}\r\n` +
    `Content-Length: ${utf8Bytes(bodyText)}\r\n` +
    'Connection: close\r\n\r\n';
  sendRaw(socket, head + bodyText);
}

function sendSseStart(socket: TcpSocket.Socket): void {
  if (socket.destroyed) return;
  try {
    socket.write(
      'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/event-stream; charset=utf-8\r\n' +
        'Cache-Control: no-cache\r\n' +
        'Connection: close\r\n\r\n',
    );
  } catch {
    /* socket died mid-write; route loop checks `destroyed` */
  }
}

function errorKind(path: string): 'openai' | 'anthropic' {
  return path.startsWith('/v1/messages') ? 'anthropic' : 'openai';
}

/** SSE write helpers; `close` ends the socket from the final write's callback. */
function sseWriter(socket: TcpSocket.Socket): {
  write: (payload: string) => void;
  close: (payload: string) => void;
} {
  const write = (payload: string) => {
    if (!socket.destroyed) {
      try {
        socket.write(payload);
      } catch {
        /* client went away */
      }
    }
  };
  // Closing via end(payload) — not write()+end() — so the native close can't
  // race the final write (see sendRaw).
  const close = (payload: string) => {
    if (socket.destroyed) return;
    try {
      socket.end(payload);
    } catch {
      /* client went away */
    }
  };
  return { write, close };
}

function anthropicTypeError(status: number, openAiType: string): string {
  if (status >= 500) return 'api_error';
  if (status === 401) return 'authentication_error';
  return openAiType;
}

function sendError(socket: TcpSocket.Socket, path: string, e: unknown): void {
  const kind = errorKind(path);
  if (e instanceof RequestError) {
    const type = kind === 'anthropic' ? anthropicTypeError(e.status, e.type) : e.type;
    sendJson(socket, e.status, errorBody(kind, type, e.message));
    return;
  }
  const msg = e instanceof Error ? e.message.split('\n')[0].slice(0, 200) : 'Unexpected error.';
  sendJson(socket, 500, errorBody(kind, kind === 'anthropic' ? 'api_error' : 'server_error', msg));
}

/** Real loaded model id, or a 503 RequestError when nothing is loaded. */
function requireLoadedModel(): string {
  if (!isModelLoaded()) {
    throw new RequestError('No model is loaded. Load a model in the app first.', 503, 'server_error');
  }
  const info = modelStore.get().model;
  if (!info) throw new RequestError('No model is loaded. Load a model in the app first.', 503, 'server_error');
  return info.id;
}

function samplerOptions(body: Record<string, unknown>): GenerateOptions {
  const st = settingsStore.get();
  return {
    nPredict: clampInt(body.max_tokens, 1, 2048, st.maxTokens),
    temperature: clampNum(body.temperature, 0, 2, st.temperature),
    topP: clampNum(body.top_p, 0, 1, st.topP),
    topK: st.topK,
    repeatPenalty: st.repeatPenalty,
  };
}

function finishOf(interrupted: boolean, tokensPredicted: number, nPredict: number): 'stop' | 'length' {
  if (!interrupted && tokensPredicted >= nPredict) return 'length';
  return 'stop';
}

async function route(socket: TcpSocket.Socket, req: ParsedRequest): Promise<void> {
  try {
    // Auth: chat/messages need a valid key when any are set; /health, / and
    // /v1/models stay open (listing downloads needs no secret).
    if (req.path !== '/health' && req.path !== '/' && req.path !== '/v1/models') {
      const keys = settingsStore.get().apiServerKeys;
      if (!apiKeyMatches(req.headers, keys)) {
        throw new RequestError(
          'Incorrect API key provided.',
          401,
          'invalid_request_error',
        );
      }
    }
    if (req.method === 'GET' && (req.path === '/health' || req.path === '/')) {
      sendJson(socket, 200, JSON.stringify({ status: 'ok', api: ['v1'] }));
      return;
    }
    if (req.method === 'GET' && req.path === '/v1/models') {
      const data = modelsStore.get().map((stored) => ({
        id: stored.id,
        object: 'model',
        created: Math.floor(stored.downloadedAt / 1000),
        owned_by: getModelEntry(stored.id)?.provider ?? 'unknown',
      }));
      sendJson(socket, 200, JSON.stringify({ object: 'list', data }));
      return;
    }
    if (req.method === 'POST' && req.path === '/v1/chat/completions') {
      await handleOpenAiChat(socket, parseJsonBody(req.body));
      return;
    }
    if (req.method === 'POST' && req.path === '/v1/responses') {
      await handleResponses(socket, parseJsonBody(req.body));
      return;
    }
    if (req.method === 'POST' && req.path === '/v1/completions') {
      await handleLegacyCompletions(socket, parseJsonBody(req.body));
      return;
    }
    if (req.method === 'POST' && req.path === '/v1/messages/count_tokens') {
      await handleCountTokens(socket, parseJsonBody(req.body));
      return;
    }
    if (req.method === 'POST' && req.path === '/v1/messages') {
      await handleAnthropic(socket, parseJsonBody(req.body));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      throw new RequestError(`Method ${req.method} is not supported.`, 405);
    }
    throw new RequestError(`Unknown endpoint: ${req.method} ${req.path}`, 404);
  } catch (e) {
    sendError(socket, req.path, e);
  }
}

async function handleOpenAiChat(socket: TcpSocket.Socket, body: Record<string, unknown>): Promise<void> {
  const messages = openAiMessagesToLlm(body.messages);
  const modelId = requireLoadedModel();
  const options = samplerOptions(body);
  const stream = body.stream === true;
  const streamId = makeId('chatcmpl-');

  if (!stream) {
    const outcome = await runCompletion(messages, options, () => {});
    const info: FinishInfo = {
      model: modelId,
      finish: finishOf(outcome.interrupted, outcome.tokensPredicted, options.nPredict),
      inputTokens: 0, // ponytail: eval-token count not exposed by the current llama.rn wrapper
      outputTokens: outcome.tokensPredicted,
    };
    sendJson(socket, 200, JSON.stringify(openAiCompletion(outcome.text, info)));
    return;
  }

  sendSseStart(socket);
  let sent = 0;
  const { write, close } = sseWriter(socket);
  write(`data: ${JSON.stringify(openAiChunk(streamId, modelId, { role: 'assistant', content: '' }, null))}\n\n`);
  const outcome = await runCompletion(messages, options, (acc) => {
    if (acc.length <= sent) return;
    const delta = acc.slice(sent);
    sent = acc.length;
    write(`data: ${JSON.stringify(openAiChunk(streamId, modelId, { content: delta }, null))}\n\n`);
  });
  // ponytail: if the final text differs from what streamed (thinking models strip
  // reasoning), the stream keeps the streamed form; non-stream replies use the final.
  if (outcome.text.length > sent) {
    write(
      `data: ${JSON.stringify(openAiChunk(streamId, modelId, { content: outcome.text.slice(sent) }, null))}\n\n`,
    );
  }
  const finish = finishOf(outcome.interrupted, outcome.tokensPredicted, options.nPredict);
  write(`data: ${JSON.stringify(openAiChunk(streamId, modelId, {}, finish))}\n\n`);
  close('data: [DONE]\n\n');
}

async function handleResponses(socket: TcpSocket.Socket, body: Record<string, unknown>): Promise<void> {
  const messages = responsesInputToLlm(body.input, body.instructions);
  const modelId = requireLoadedModel();
  // Responses API names the cap max_output_tokens; accept it via samplerOptions.
  const options = samplerOptions({ ...body, max_tokens: body.max_tokens ?? body.max_output_tokens });
  const stream = body.stream === true;
  const responseId = makeId('resp_');
  const base = {
    id: responseId,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model: modelId,
    output: [] as unknown[],
  };

  if (!stream) {
    const outcome = await runCompletion(messages, options, () => {});
    const info: FinishInfo = {
      model: modelId,
      finish: finishOf(outcome.interrupted, outcome.tokensPredicted, options.nPredict),
      inputTokens: 0, // ponytail: eval-token count not exposed by the current llama.rn wrapper
      outputTokens: outcome.tokensPredicted,
    };
    sendJson(socket, 200, JSON.stringify(responsesCompletion(outcome.text, info)));
    return;
  }

  sendSseStart(socket);
  const { write, close } = sseWriter(socket);
  const itemId = makeId('msg_');
  write(responsesEvent('response.created', { response: { ...base, status: 'in_progress' } }));
  write(
    responsesEvent('response.output_item.added', {
      output_index: 0,
      item: { type: 'message', id: itemId, status: 'in_progress', role: 'assistant', content: [] },
    }),
  );
  write(
    responsesEvent('response.content_part.added', {
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    }),
  );
  let sent = 0;
  const outcome = await runCompletion(messages, options, (acc) => {
    if (acc.length <= sent) return;
    const delta = acc.slice(sent);
    sent = acc.length;
    write(
      responsesEvent('response.output_text.delta', {
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        delta,
      }),
    );
  });
  if (outcome.text.length > sent) {
    write(
      responsesEvent('response.output_text.delta', {
        item_id: itemId,
        output_index: 0,
        content_index: 0,
        delta: outcome.text.slice(sent),
      }),
    );
  }
  const messageItem = responsesMessageItem(itemId, outcome.text);
  write(
    responsesEvent('response.output_text.done', {
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      text: outcome.text,
    }),
  );
  write(
    responsesEvent('response.content_part.done', {
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: outcome.text, annotations: [] },
    }),
  );
  write(responsesEvent('response.output_item.done', { output_index: 0, item: messageItem }));
  const usage = {
    input_tokens: 0,
    output_tokens: outcome.tokensPredicted,
    total_tokens: outcome.tokensPredicted,
  };
  close(
    responsesEvent('response.completed', {
      response: { ...base, status: 'completed', output: [messageItem], usage },
    }),
  );
}

async function handleLegacyCompletions(
  socket: TcpSocket.Socket,
  body: Record<string, unknown>,
): Promise<void> {
  const messages = completionsPromptToLlm(body.prompt);
  const modelId = requireLoadedModel();
  const options = samplerOptions(body);
  const stream = body.stream === true;
  const id = makeId('cmpl-');

  if (!stream) {
    const outcome = await runCompletion(messages, options, () => {});
    const info: FinishInfo = {
      model: modelId,
      finish: finishOf(outcome.interrupted, outcome.tokensPredicted, options.nPredict),
      inputTokens: 0, // ponytail: eval-token count not exposed by the current llama.rn wrapper
      outputTokens: outcome.tokensPredicted,
    };
    sendJson(socket, 200, JSON.stringify(completionsCompletion(outcome.text, info)));
    return;
  }

  sendSseStart(socket);
  const { write, close } = sseWriter(socket);
  let sent = 0;
  const outcome = await runCompletion(messages, options, (acc) => {
    if (acc.length <= sent) return;
    const delta = acc.slice(sent);
    sent = acc.length;
    write(`data: ${JSON.stringify(completionsChunk(id, modelId, delta, null))}\n\n`);
  });
  if (outcome.text.length > sent) {
    write(`data: ${JSON.stringify(completionsChunk(id, modelId, outcome.text.slice(sent), null))}\n\n`);
  }
  const finish = finishOf(outcome.interrupted, outcome.tokensPredicted, options.nPredict);
  write(`data: ${JSON.stringify(completionsChunk(id, modelId, '', finish))}\n\n`);
  close('data: [DONE]\n\n');
}

async function handleCountTokens(socket: TcpSocket.Socket, body: Record<string, unknown>): Promise<void> {
  const context = getLoadedContext();
  if (!context) {
    throw new RequestError('No model is loaded. Load a model in the app first.', 503, 'server_error');
  }
  const messages = anthropicMessagesToLlm(body.system, body.messages);
  // Honest approximation: tokens of the message text without the chat template.
  const { tokens } = await context.tokenize(messages.map((m) => m.content).join('\n'));
  sendJson(socket, 200, JSON.stringify({ input_tokens: tokens.length }));
}

async function handleAnthropic(socket: TcpSocket.Socket, body: Record<string, unknown>): Promise<void> {
  const messages = anthropicMessagesToLlm(body.system, body.messages);
  const modelId = requireLoadedModel();
  const options = samplerOptions(body);
  const stream = body.stream === true;

  if (!stream) {
    const outcome = await runCompletion(messages, options, () => {});
    const info: FinishInfo = {
      model: modelId,
      finish: finishOf(outcome.interrupted, outcome.tokensPredicted, options.nPredict),
      inputTokens: 0, // ponytail: eval-token count not exposed by the current llama.rn wrapper
      outputTokens: outcome.tokensPredicted,
    };
    sendJson(socket, 200, JSON.stringify(anthropicMessage(outcome.text, info)));
    return;
  }

  sendSseStart(socket);
  const { write, close } = sseWriter(socket);
  const messageId = makeId('msg_');
  write(
    anthropicEvent('message_start', {
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model: modelId,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }),
  );
  write(anthropicEvent('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }));
  let sent = 0;
  const outcome = await runCompletion(messages, options, (acc) => {
    if (acc.length <= sent) return;
    const delta = acc.slice(sent);
    sent = acc.length;
    write(anthropicEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: delta } }));
  });
  if (outcome.text.length > sent) {
    write(
      anthropicEvent('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: outcome.text.slice(sent) },
      }),
    );
  }
  write(anthropicEvent('content_block_stop', { index: 0 }));
  const finish = finishOf(outcome.interrupted, outcome.tokensPredicted, options.nPredict);
  write(
    anthropicEvent('message_delta', {
      delta: { stop_reason: finish === 'length' ? 'max_tokens' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: outcome.tokensPredicted },
    }),
  );
  close(anthropicEvent('message_stop', {}));
}
