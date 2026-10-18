// Runnable logic check for the non-trivial pure rules: `node selfcheck.ts` (Node >= 22.6 strips types).
import { MODEL_CATALOG, totalSizeBytes } from './src/models/catalog.ts';
import { DEFAULT_SETTINGS, sanitize } from './src/settings/settingsSanitize.ts';
import { titleFromFirstMessage } from './src/chat/titleRule.ts';
import {
  anthropicMessagesToLlm,
  apiKeyMatches,
  clampInt,
  clampNum,
  errorBody,
  MAX_BODY_BYTES,
  openAiCompletion,
  openAiMessagesToLlm,
  parseHttpRequest,
  parseJsonBody,
  RequestError,
  completionsChunk,
  completionsCompletion,
  completionsPromptToLlm,
  responsesCompletion,
  responsesEvent,
  responsesInputToLlm,
  utf8Bytes,
} from './src/server/protocol.ts';

let checks = 0;
function ok(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) throw new Error(`selfcheck failed: ${label}`);
}

// --- settings sanitize (corrupted/partial stored JSON must never break startup) ---
ok(sanitize(null).contextSize === 2048, 'null -> defaults');
ok(sanitize('junk').maxTokens === 256, 'string -> defaults');
ok(sanitize(DEFAULT_SETTINGS).temperature === 0.7, 'defaults pass through');
ok(sanitize({ contextSize: 4096 }).contextSize === 4096, 'valid context size kept');
ok(sanitize({ contextSize: 3000 }).contextSize === 2048, 'invalid context size dropped');
ok(sanitize({ contextSize: '2048' }).contextSize === 2048, 'string context size dropped');
ok(sanitize({ maxTokens: 700 }).maxTokens === 512, 'maxTokens snaps to 512');
ok(sanitize({ maxTokens: 2000 }).maxTokens === 1024, 'maxTokens snaps to 1024');
ok(sanitize({ maxTokens: 64 }).maxTokens === 128, 'min maxTokens snaps to 128');
ok(sanitize({ maxTokens: 5000 }).maxTokens === 256, 'out-of-range maxTokens dropped');
ok(sanitize({ temperature: 1.5 }).temperature === 1.5, 'temperature kept');
ok(sanitize({ temperature: 3 }).temperature === 0.7, 'temperature out of range dropped');
ok(sanitize({ topP: 0 }).topP === 0.9, 'topP zero dropped');
ok(sanitize({ topP: 1 }).topP === 1, 'topP 1 kept');
ok(sanitize({ topK: 64 }).topK === 64, 'valid topK kept');
ok(sanitize({ topK: 50 }).topK === 40, 'non-choice topK dropped');
ok(sanitize({ repeatPenalty: 1.3 }).repeatPenalty === 1.3, 'valid repeatPenalty kept');
ok(sanitize({ repeatPenalty: 1.26 }).repeatPenalty === 1.3, 'repeatPenalty rounds to 1 decimal');
ok(sanitize({ repeatPenalty: 0.5 }).repeatPenalty === 1, 'repeatPenalty below 1 dropped');
ok(sanitize({ imageMaxTokens: 512 }).imageMaxTokens === 512, 'valid imageMaxTokens kept');
ok(sanitize({ imageMaxTokens: 300 }).imageMaxTokens === 1024, 'non-choice imageMaxTokens dropped');
ok(sanitize({ systemPrompt: 'x'.repeat(4000) }).systemPrompt === DEFAULT_SETTINGS.systemPrompt, 'oversized prompt dropped');
ok(sanitize({ theme: 'purple' }).theme === 'system', 'unknown theme dropped');
ok(sanitize({ theme: 'dark' }).theme === 'dark', 'valid theme kept');

// --- chat title rule (first user message -> history label) ---
ok(titleFromFirstMessage('hello world') === 'hello world', 'short title kept');
ok(titleFromFirstMessage('   ') === 'New chat', 'blank becomes New chat');
ok(titleFromFirstMessage('  a \n  b  ') === 'a b', 'whitespace collapsed');
const exact = 'x'.repeat(40);
ok(titleFromFirstMessage(exact) === exact, '40 chars kept whole');
ok(titleFromFirstMessage('x'.repeat(41)) === `${'x'.repeat(40)}…`, 'over 40 trimmed with ellipsis');

// --- catalog integrity (a bad URL/hash here would brick a download) ---
ok(MODEL_CATALOG.length >= 12, 'catalog not empty');
ok(new Set(MODEL_CATALOG.map((m) => m.id)).size === MODEL_CATALOG.length, 'catalog ids unique');
for (const m of MODEL_CATALOG) {
  ok(/^[0-9a-f]{64}$/.test(m.sha256), `sha256 well-formed: ${m.id}`);
  ok(m.url.startsWith('https://huggingface.co/'), `download url on huggingface.co: ${m.id}`);
  ok(m.approxSizeBytes > 0 && totalSizeBytes(m) >= m.approxSizeBytes, `size sane: ${m.id}`);
  ok(Boolean(m.provider && m.name && m.quant), `provider/name/quant present: ${m.id}`);
  ok(m.mmproj === undefined || /^[0-9a-f]{64}$/.test(m.mmproj.sha256), `mmproj sha: ${m.id}`);
}

// --- /v1 API protocol (request parsing + payload mapping) ---
ok(utf8Bytes('abc') === 3, 'utf8 ascii');
ok(utf8Bytes('é') === 2, 'utf8 2-byte');
ok(utf8Bytes('😀') === 4, 'utf8 surrogate pair counted once');
const reqLine = 'GET /v1/models?x=1 HTTP/1.1\r\nHost: a\r\n\r\n';
const parsed = parseHttpRequest(reqLine);
ok(parsed !== null && parsed.method === 'GET' && parsed.path === '/v1/models', 'GET parsed, query stripped');
ok(parseHttpRequest('POST /v1 HTTP/1.1\r\nContent-Length: 5\r\n\r\nhe') === null, 'partial body still arriving');
let threw = false;
try {
  parseHttpRequest('nope\r\n\r\n');
} catch (e) {
  threw = e instanceof RequestError && e.status === 400;
}
ok(threw, 'malformed request line -> 400');
threw = false;
try {
  parseHttpRequest(`${'X'.repeat(20000)}\r\n\r\n`);
} catch (e) {
  threw = e instanceof RequestError && e.status === 431;
}
ok(threw, 'oversized headers -> 431');
threw = false;
try {
  parseHttpRequest('POST /v1 HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n');
} catch (e) {
  threw = e instanceof RequestError && e.status === 411;
}
ok(threw, 'chunked body -> 411');
threw = false;
try {
  parseHttpRequest(`POST /v1 HTTP/1.1\r\nContent-Length: ${MAX_BODY_BYTES + 1}\r\n\r\n`);
} catch (e) {
  threw = e instanceof RequestError && e.status === 413;
}
ok(threw, 'oversized body -> 413');
threw = false;
try {
  parseHttpRequest('POST /v1 HTTP/1.1\r\nContent-Length: abc\r\n\r\n');
} catch (e) {
  threw = e instanceof RequestError && e.status === 400;
}
ok(threw, 'non-numeric content-length -> 400');
const postBody = JSON.stringify({ hello: 'wörld 😀' });
const bytes = utf8Bytes(postBody);
const postReq = parseHttpRequest(`POST /v1/messages HTTP/1.1\r\nContent-Length: ${bytes}\r\n\r\n${postBody}`);
ok(postReq !== null && postReq.body === postBody, 'multibyte body round-trips byte-exact');
ok(JSON.stringify(parseJsonBody(postBody)) === postBody, 'json body parses');
threw = false;
try {
  parseJsonBody('[]');
} catch (e) {
  threw = e instanceof RequestError && e.status === 400;
}
ok(threw, 'array body rejected (must be object)');

const oaiMsgs = openAiMessagesToLlm([
  { role: 'system', content: 'be brief' },
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
]);
ok(
  oaiMsgs.length === 3 && oaiMsgs[0].role === 'system' && oaiMsgs[2].content === 'ab',
  'openai messages mapped, parts joined',
);
threw = false;
try {
  openAiMessagesToLlm([{ role: 'tool', content: 'x' }]);
} catch (e) {
  threw = e instanceof RequestError && e.status === 400;
}
ok(threw, 'openai tool role rejected');
threw = false;
try {
  openAiMessagesToLlm([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }]);
} catch (e) {
  threw = e instanceof RequestError && e.status === 400 && e.type === 'unsupported';
}
ok(threw, 'openai image part -> unsupported 400');

const antMsgs = anthropicMessagesToLlm('sys', [
  { role: 'user', content: [{ type: 'text', text: 'q' }] },
  { role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'a' }] },
]);
ok(
  antMsgs.length === 3 && antMsgs[0].role === 'system' && antMsgs[2].content === 'a',
  'anthropic messages mapped, system prepended, thinking dropped',
);
threw = false;
try {
  anthropicMessagesToLlm(undefined, [{ role: 'user', content: [{ type: 'tool_use', name: 'x' }] }]);
} catch (e) {
  threw = e instanceof RequestError && e.status === 400;
}
ok(threw, 'anthropic tool block rejected');

ok(clampInt(undefined, 1, 100, 256) === 256, 'clampInt default');
ok(clampInt(9999, 1, 2048, 256) === 2048, 'clampInt max');
ok(clampInt(-5, 1, 2048, 256) === 1, 'clampInt min');
ok(clampInt('700', 1, 2048, 256) === 256, 'clampInt non-number -> default');
ok(clampNum(0.7, 0, 2, 0.5) === 0.7, 'clampNum keeps in range');
ok(clampNum(NaN, 0, 2, 0.5) === 0.5, 'clampNum NaN -> default');

const completion = openAiCompletion('hi', { model: 'real-id', finish: 'length', inputTokens: 0, outputTokens: 5 });
const c = completion as Record<string, unknown>;
ok(c.model === 'real-id', 'completion reports real model id');
ok(
  (c.choices as Array<Record<string, unknown>>)[0].finish_reason === 'length',
  'completion finish_reason',
);
const ob = JSON.parse(errorBody('openai', 'invalid_request_error', 'bad')) as Record<string, unknown>;
ok(JSON.stringify(ob.error).includes('bad'), 'openai error body shape');
const ab = JSON.parse(errorBody('anthropic', 'api_error', 'boom')) as Record<string, unknown>;
ok(ab.type === 'error' && JSON.stringify(ab.error).includes('boom'), 'anthropic error body shape');

// --- API key auth (multi-key) ---
ok(apiKeyMatches({}, []), 'no keys disables auth');
ok(apiKeyMatches({}, ['sk-secret1']) === false, 'missing header rejected');
ok(apiKeyMatches({ authorization: 'Bearer sk-secret1' }, ['sk-secret1']), 'openai bearer accepted');
ok(apiKeyMatches({ authorization: 'bearer sk-secret1' }, ['sk-secret1']), 'bearer scheme case-insensitive');
ok(apiKeyMatches({ 'x-api-key': 'sk-secret1' }, ['sk-secret1']), 'anthropic x-api-key accepted');
ok(
  apiKeyMatches({ authorization: 'Bearer sk-secret2' }, ['sk-secret1', 'sk-secret2']),
  'any listed key accepted',
);
ok(apiKeyMatches({ authorization: 'Bearer wrongkey1' }, ['sk-secret1']) === false, 'wrong key rejected');
ok(apiKeyMatches({ authorization: 'Bearer sk-secret1X' }, ['sk-secret1']) === false, 'wrong length rejected');
const authParsed = parseHttpRequest(
  `POST /v1/messages HTTP/1.1\r\nX-Api-Key: abc\r\nContent-Length: 2\r\n\r\n{} `,
);
ok(
  authParsed !== null && authParsed.headers['x-api-key'] === 'abc',
  'headers lowercased and exposed',
);
ok(sanitize({ apiServerKeys: ['sk-abcdef12', 'sk-456789ab'] }).apiServerKeys.length === 2, 'key list kept');
ok(
  sanitize({ apiServerKeys: ['sk-abcdef12', 'sk-abcdef12', 'short'] }).apiServerKeys.length === 1,
  'duplicate and short keys dropped',
);
ok(sanitize({ apiServerKeys: [123, 'sk-okkey12'] }).apiServerKeys.length === 1, 'non-string keys dropped');
ok(sanitize({ apiServerKey: 'sk-legacykey' }).apiServerKeys.includes('sk-legacykey'), 'legacy single key migrated');
ok(sanitize(DEFAULT_SETTINGS).apiServerKeys.length === 0, 'default key list empty');

// --- /v1/responses (OpenAI Responses API) ---
const rIn = responsesInputToLlm('hi there', undefined);
ok(rIn.length === 1 && rIn[0].role === 'user' && rIn[0].content === 'hi there', 'responses: string input');
const rSys = responsesInputToLlm('hi', 'be terse');
ok(rSys.length === 2 && rSys[0].role === 'system' && rSys[0].content === 'be terse', 'responses: instructions -> system');
const rItems = responsesInputToLlm(
  [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: [{ type: 'output_text', text: 'a1' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'q2' }] },
  ],
  undefined,
);
ok(
  rItems.map((m) => m.content).join('|') === 'q1|a1|q2',
  'responses: input items with text parts',
);
let rThrew = false;
try {
  responsesInputToLlm([{ role: 'tool', content: 'x' }], undefined);
} catch {
  rThrew = true;
}
ok(rThrew, 'responses: unsupported input role rejected');
rThrew = false;
try {
  responsesInputToLlm(42, undefined);
} catch {
  rThrew = true;
}
ok(rThrew, 'responses: non-string/array input rejected');
rThrew = false;
try {
  responsesInputToLlm([{ role: 'user', content: [{ type: 'input_image' }] }], undefined);
} catch {
  rThrew = true;
}
ok(rThrew, 'responses: image input rejected');
const rBody = responsesCompletion('hello world', { model: 'm1', finish: 'stop', inputTokens: 3, outputTokens: 5 });
ok(rBody.object === 'response' && rBody.status === 'completed' && rBody.model === 'm1', 'responses: completion shape');
const rOut = rBody.output as Record<string, unknown>[];
ok(
  rOut.length === 1 && rOut[0].type === 'message' && rOut[0].role === 'assistant',
  'responses: output message item',
);
const rUsage = rBody.usage as Record<string, number>;
ok(rUsage.total_tokens === 8 && rUsage.output_tokens === 5, 'responses: usage totals');
const rSse = responsesEvent('response.created', { response: { id: 'r1' } });
ok(
  rSse.startsWith('event: response.created\n') && rSse.includes('"type":"response.created"') && rSse.endsWith('\n\n'),
  'responses: sse event frame',
);

// --- legacy /v1/completions ---
const cMsgs = completionsPromptToLlm('Write a haiku');
ok(cMsgs.length === 1 && cMsgs[0].role === 'user' && cMsgs[0].content === 'Write a haiku', 'completions: string prompt');
const cArr = completionsPromptToLlm(['first', 'second']);
ok(cArr.length === 1 && cArr[0].content === 'first', 'completions: array prompt takes first');
let cThrew = false;
try {
  completionsPromptToLlm(123);
} catch {
  cThrew = true;
}
ok(cThrew, 'completions: non-string prompt rejected');
cThrew = false;
try {
  completionsPromptToLlm([]);
} catch {
  cThrew = true;
}
ok(cThrew, 'completions: empty prompt array rejected');
const cBody = completionsCompletion(' generated', { model: 'm1', finish: 'stop', inputTokens: 2, outputTokens: 4 });
ok(cBody.object === 'text_completion' && cBody.model === 'm1', 'completions: body shape');
const cChoices = cBody.choices as Record<string, unknown>[];
ok(
  cChoices.length === 1 && cChoices[0].text === ' generated' && cChoices[0].finish_reason === 'stop',
  'completions: choice shape',
);
const cUsage = cBody.usage as Record<string, number>;
ok(cUsage.total_tokens === 6, 'completions: usage total');
const cChunk = completionsChunk('cmpl-1', 'm1', 'tok', null);
const cChunkChoices = cChunk.choices as Record<string, unknown>[];
ok(
  cChunk.object === 'text_completion' && cChunkChoices[0].text === 'tok' && cChunkChoices[0].finish_reason === null,
  'completions: stream chunk shape',
);

console.log(`selfcheck: ${checks} checks passed`);
