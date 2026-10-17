// Runnable logic check for the non-trivial pure rules: `node selfcheck.ts` (Node >= 22.6 strips types).
import { DEFAULT_SETTINGS, sanitize } from './src/settings/settingsSanitize.ts';
import { titleFromFirstMessage } from './src/chat/titleRule.ts';

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

console.log(`selfcheck: ${checks} checks passed`);
