import { runCompletion, stopGeneration, modelStore } from '@/ai/modelManager';
import type { LlmMessage } from '@/ai/llmService';
import {
  clearAllConversations,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from '@/chat/chatRepository';
import { createStore } from '@/hooks/use-store';
import { settingsStore } from '@/settings/settingsRepository';
import { Attachment, ChatMessage, ChatMode, Conversation } from '@/types';
import { File } from 'expo-file-system';

import { applyUserEdit } from './editRule';

export interface ChatState {
  conversation: Conversation | null;
  sending: boolean;
  error: string | null;
  initialized: boolean;
  chatMode: ChatMode;
}

const initialState: ChatState = {
  conversation: null,
  sending: false,
  error: null,
  initialized: false,
  chatMode: 'chat',
};

export const chatStore = createStore<ChatState>(initialState);

function patch(partial: Partial<ChatState>): void {
  chatStore.set({ ...chatStore.get(), ...partial });
}

export function setChatMode(mode: ChatMode): void {
  patch({ chatMode: mode });
}

async function persist(conv: Conversation): Promise<void> {
  try {
    await saveConversation(conv);
  } catch {
    // Never lose the in-memory conversation because persistence failed.
  }
}

/** Load the most recent conversation once at app start. */
export async function initChatSession(): Promise<void> {
  if (chatStore.get().initialized) return;
  try {
    const all = await listConversations();
    patch({ conversation: all[0] ?? null, initialized: true });
  } catch {
    patch({ conversation: null, initialized: true });
  }
}

export async function newChat(): Promise<void> {
  if (chatStore.get().sending) return;
  const current = chatStore.get().conversation;
  // Don't litter storage with empty conversations.
  if (current && current.messages.length === 0) return;
  const conv = await createConversation(null);
  patch({ conversation: conv, error: null });
}

export async function openConversation(id: string): Promise<void> {
  if (chatStore.get().sending) return;
  const conv = await getConversation(id);
  if (conv) patch({ conversation: conv, error: null });
}

export async function deleteCurrentConversation(): Promise<void> {
  const conv = chatStore.get().conversation;
  patch({ conversation: null, error: null });
  if (conv) await deleteConversation(conv.id);
}

/** Removes every stored conversation and resets the in-memory session. */
export async function clearAllChats(): Promise<void> {
  if (chatStore.get().sending) return;
  patch({ conversation: null, error: null });
  await clearAllConversations();
}

/** Builds the llama.rn message array: system prompt + bounded recent history. */
function buildLlmMessages(conv: Conversation): LlmMessage[] {
  const { systemPrompt } = settingsStore.get();
  const chatMode = chatStore.get().chatMode;
  const history = conv.messages.filter(
    (m) => (m.role === 'user' || m.role === 'assistant' || m.role === 'tool') && !m.pending && !m.error,
  );
  // Keep the prompt well inside the context window (ceiling: 24 messages).
  const recent = history.slice(-24);

  // Only the newest still-existing photo is sent as image content: re-sending
  // every older image each turn would balloon the prompt past the context.
  let imageIndex = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    const uri = recent[i].imageUri;
    if (!uri) continue;
    let exists = false;
    try {
      exists = new File(uri).exists;
    } catch {
      exists = false;
    }
    if (exists) {
      imageIndex = i;
      break;
    }
  }

  const messages: LlmMessage[] = recent.map((m, i) => {
    if (i === imageIndex && m.imageUri && m.role === 'user') {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: m.imageUri } },
        ],
      } as LlmMessage;
    }
    if (m.role === 'tool') {
      return { role: 'tool' as any, content: m.content, tool_call_id: m.toolCallId } as LlmMessage;
    }
    return { role: m.role as any, content: m.content } as LlmMessage;
  });

  const system =
    chatMode === 'agentic'
      ? `${systemPrompt}\n\nYou have access to tools. When needed, call tools using function calling format. Available tools: calculator (expression), get_time (timezone), web_search (query).`
      : systemPrompt;
  return [{ role: 'system', content: system }, ...messages];
}

/**
 * Runs one assistant turn over the current conversation.
 * Appends a pending assistant message, streams into it, then persists.
 */
export async function sendUserMessage(rawText: string, attachment?: Attachment): Promise<void> {
  const { sending } = chatStore.get();
  if (sending) return;
  const text = rawText.trim();
  if (!text && !attachment) return;
  // Fresh installs have no conversation yet — the first send creates it.
  let conversation = chatStore.get().conversation;
  if (!conversation) {
    conversation = await createConversation(null);
    patch({ conversation });
  }

  patch({ sending: true, error: null });

  // One attachment per message: photos ride as image content, text files are
  // inlined into the message body (there is no file-native LLM input).
  let content = text;
  let imageUri: string | undefined;
  if (attachment?.kind === 'image') {
    imageUri = attachment.uri;
    if (!content) content = 'What do you see in this image?';
  } else if (attachment?.kind === 'file') {
    const block = `[${attachment.name}]\n\`\`\`\n${attachment.text}\n\`\`\``;
    content = text ? `${text}\n\n${block}` : block;
  }

  const userMsg: ChatMessage = {
    id: `${conversation.id}-u${Date.now()}`,
    role: 'user',
    content,
    createdAt: Date.now(),
    imageUri,
  };
  const assistantMsg: ChatMessage = {
    id: `${conversation.id}-a${Date.now()}`,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    pending: true,
  };

  const next: Conversation = {
    ...conversation,
    messages: [...conversation.messages, userMsg, assistantMsg],
  };
  patch({ conversation: next });

  await runTurn(next, assistantMsg.id);
}

/**
 * Edits a sent user message and regenerates: the message content is replaced
 * and everything after it (the old reply) is dropped before the new turn runs.
 */
export async function editUserMessage(messageId: string, rawText: string): Promise<void> {
  const { sending, conversation } = chatStore.get();
  if (sending || !conversation) return;
  const text = rawText.trim();
  if (!text) return;
  const messages = applyUserEdit(conversation.messages, messageId, text);
  if (!messages) return;

  patch({ sending: true, error: null });
  const assistantMsg: ChatMessage = {
    id: `${conversation.id}-a${Date.now()}`,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    pending: true,
  };
  // ponytail: the history title keeps the original first-message text after an
  // edit — recompute it in saveConversation if that ever matters.
  const next: Conversation = { ...conversation, messages: [...messages, assistantMsg] };
  patch({ conversation: next });
  await runTurn(next, assistantMsg.id);
}

/** Retries after a failed turn: regenerates the reply to the last user message. */
export async function retryLastTurn(): Promise<void> {
  const { conversation, sending } = chatStore.get();
  if (sending || !conversation) return;
  const messages = conversation.messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || !last.error) return;

  // Drop the failed reply and regenerate.
  const trimmed = messages.slice(0, -1);
  const assistantMsg: ChatMessage = {
    ...last,
    content: '',
    createdAt: Date.now(),
    pending: true,
    error: undefined,
  };
  const next: Conversation = { ...conversation, messages: [...trimmed, assistantMsg] };
  patch({ conversation: next, sending: true, error: null });
  await runTurn(next, assistantMsg.id);
}

async function runTurn(conv: Conversation, assistantMsgId: string): Promise<void> {
  // Associate the conversation with whatever model is loaded now.
  const loadedId = modelStore.get().model?.id ?? null;
  if (loadedId) conv = { ...conv, modelId: loadedId };

  const replaceAssistant = (content: string, extra?: Partial<ChatMessage>) => {
    const current = chatStore.get().conversation;
    if (!current) return;
    patch({
      conversation: {
        ...current,
        messages: current.messages.map((m) =>
          m.id === assistantMsgId ? { ...m, content, ...extra } : m,
        ),
      },
    });
  };

  try {
    const chatMode = chatStore.get().chatMode;
    const llmMessages = buildLlmMessages(conv);
    const { maxTokens, temperature, topP, topK, repeatPenalty } = settingsStore.get();
    let acc = '';
    const outcome = await runCompletion(
      llmMessages,
      { nPredict: maxTokens, temperature, topP, topK, repeatPenalty },
      (partial) => {
        acc = partial;
        replaceAssistant(partial);
      },
    );

    let finalText = outcome.text || acc || '(no response)';
    const current = chatStore.get().conversation;

    if (chatMode === 'agentic' && current) {
      try {
        const jsonMatch = finalText.match(/```json\s*([\s\S]*?)```/) || finalText.match(/\{[\s\S]*"tool_calls"[\s\S]*\}/);
        if (jsonMatch) {
          const raw = jsonMatch[1] || jsonMatch[0];
          const parsed = JSON.parse(raw);
          const toolCalls = parsed.tool_calls || parsed.tools || [];
          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            const calls = toolCalls
              .map((tc: any, idx: number) => ({
                id: `call_${Date.now()}_${idx}`,
                name: tc.name || tc.function?.name || '',
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || tc.function?.arguments || {}),
              }))
              .filter((c: any) => c.name);
            if (calls.length > 0) {
              replaceAssistant(finalText, { toolCalls: calls, pending: false });
              await persist(chatStore.get().conversation!);
              const toolResults: ChatMessage[] = [];
              for (const call of calls) {
                let result = '';
                try {
                  if (call.name === 'calculator') {
                    const args = JSON.parse(call.arguments || '{}');
                    const expr = String(args.expression || args.expr || '');
                    const safe = expr.replace(/[^0-9+\-*/().\s]/g, '');
                    // eslint-disable-next-line no-eval
                    result = String(eval(safe || '0'));
                  } else if (call.name === 'get_time') {
                    const args = JSON.parse(call.arguments || '{}');
                    const tz = args.timezone || args.tz || 'UTC';
                    result = new Date().toLocaleString('en-US', { timeZone: tz });
                  } else if (call.name === 'web_search') {
                    const args = JSON.parse(call.arguments || '{}');
                    result = `Web search results for: ${args.query || ''} (search disabled in offline mode)`;
                  } else {
                    result = `Unknown tool: ${call.name}`;
                  }
                } catch (err) {
                  result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
                }
                toolResults.push({
                  id: `${conv.id}-t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  role: 'tool',
                  content: result,
                  createdAt: Date.now(),
                  toolCallId: call.id,
                  toolName: call.name,
                });
              }
              const c2 = chatStore.get().conversation!;
              const convWithTools: Conversation = { ...c2, messages: [...c2.messages, ...toolResults], updatedAt: Date.now() };
              patch({ conversation: convWithTools });
              await persist(convWithTools);
              const nextAssistant: ChatMessage = {
                id: `${conv.id}-a${Date.now() + 1}`,
                role: 'assistant',
                content: '',
                createdAt: Date.now(),
                pending: true,
              };
              const convFinal: Conversation = { ...convWithTools, messages: [...convWithTools.messages, nextAssistant] };
              patch({ conversation: convFinal });
              await runTurn(convFinal, nextAssistant.id);
              return;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (current) {
      replaceAssistant(finalText, { pending: false, toolCalls: undefined });
      await persist(chatStore.get().conversation!);
    }
    patch({ sending: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed.';
    // Keep any partially streamed text — the bubble shows it with an error border.
    const partial =
      chatStore.get().conversation?.messages.find((m) => m.id === assistantMsgId)?.content ?? '';
    replaceAssistant(partial, { pending: false, error: message });
    patch({ sending: false, error: message });
    await persist(chatStore.get().conversation!);
  }
}

export async function regenerateFromMessage(messageId: string): Promise<void> {
  const { sending, conversation } = chatStore.get();
  if (sending || !conversation) return;
  const idx = conversation.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  let cut = idx;
  if (conversation.messages[idx].role === 'assistant') {
    while (cut > 0 && conversation.messages[cut - 1].role === 'assistant') cut--;
    if (cut > 0 && conversation.messages[cut - 1].role === 'tool') {
      cut--;
      while (cut > 0 && conversation.messages[cut - 1].role === 'tool') cut--;
    }
  }
  const messages = conversation.messages.slice(0, cut);
  if (!messages.length) return;
  patch({ sending: true, error: null });
  const assistantMsg: ChatMessage = {
    id: `${conversation.id}-a${Date.now()}`,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    pending: true,
  };
  const next: Conversation = { ...conversation, messages: [...messages, assistantMsg], updatedAt: Date.now() };
  patch({ conversation: next });
  void persist(next);
  await runTurn(next, assistantMsg.id);
}

export async function deleteMessageAndResponse(messageId: string): Promise<void> {
  const { sending, conversation } = chatStore.get();
  if (sending || !conversation) return;
  const idx = conversation.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  let end = idx + 1;
  if (conversation.messages[idx].role === 'user') {
    while (end < conversation.messages.length && (conversation.messages[end].role === 'assistant' || conversation.messages[end].role === 'tool')) end++;
  } else if (conversation.messages[idx].role === 'assistant') {
    while (end < conversation.messages.length && (conversation.messages[end].role === 'assistant' || conversation.messages[end].role === 'tool')) end++;
  }
  const messages = conversation.messages.slice(0, idx).concat(conversation.messages.slice(end));
  const next: Conversation = { ...conversation, messages, updatedAt: Date.now() };
  patch({ conversation: next, error: null });
  void persist(next);
}

export function stopStreaming(): void {
  stopGeneration();
}
