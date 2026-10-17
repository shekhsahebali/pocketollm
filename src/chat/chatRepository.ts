import AsyncStorage from '@react-native-async-storage/async-storage';

import { ChatMessage, Conversation } from '@/types';

import { titleFromFirstMessage } from './titleRule';

const INDEX_KEY = 'openpocket.conversations.v1';
/** Cap stored conversations so AsyncStorage cannot grow without bound. */
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_CONTENT_LENGTH = 32_000;

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidMessage(m: unknown): m is ChatMessage {
  if (typeof m !== 'object' || m === null) return false;
  const x = m as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    (x.role === 'user' || x.role === 'assistant' || x.role === 'system') &&
    typeof x.content === 'string' &&
    typeof x.createdAt === 'number'
  );
}

function isValidConversation(c: unknown): c is Conversation {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.title === 'string' &&
    Array.isArray(x.messages) &&
    x.messages.every(isValidMessage) &&
    typeof x.createdAt === 'number' &&
    typeof x.updatedAt === 'number'
  );
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

function convKey(id: string): string {
  return `openpocket.conversation.${id}`;
}

export async function listConversations(): Promise<Conversation[]> {
  const ids = await readIndex();
  const entries = await AsyncStorage.multiGet(ids.map(convKey));
  const out: Conversation[] = [];
  for (const [, raw] of entries) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (isValidConversation(parsed)) out.push(parsed);
    } catch {
      // corrupted entry — skip it
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const raw = await AsyncStorage.getItem(convKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidConversation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function createConversation(modelId: string | null): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: makeId(),
    title: 'New chat',
    messages: [],
    modelId,
    createdAt: now,
    updatedAt: now,
  };
  await AsyncStorage.setItem(convKey(conv.id), JSON.stringify(conv));
  const ids = await readIndex();
  ids.unshift(conv.id);
  await writeIndex(prune(ids));
  return conv;
}

function prune(ids: string[]): string[] {
  if (ids.length <= MAX_CONVERSATIONS) return ids;
  const removed = ids.slice(MAX_CONVERSATIONS);
  void AsyncStorage.multiRemove(removed.map(convKey));
  return ids.slice(0, MAX_CONVERSATIONS);
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const trimmed: Conversation = {
    ...conv,
    title:
      conv.messages.find((m) => m.role === 'user') != null && conv.title === 'New chat'
        ? titleFromFirstMessage(conv.messages.find((m) => m.role === 'user')!.content)
        : conv.title,
    messages: conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map((m) => ({
      ...m,
      content:
        m.content.length > MAX_CONTENT_LENGTH
          ? `${m.content.slice(0, MAX_CONTENT_LENGTH)}…`
          : m.content,
      pending: false,
    })),
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(convKey(trimmed.id), JSON.stringify(trimmed));
  const ids = await readIndex();
  if (!ids.includes(trimmed.id)) {
    ids.unshift(trimmed.id);
    await writeIndex(prune(ids));
  }
}

export async function deleteConversation(id: string): Promise<void> {
  await AsyncStorage.removeItem(convKey(id));
  const ids = await readIndex();
  await writeIndex(ids.filter((x) => x !== id));
}

export async function clearAllConversations(): Promise<void> {
  const ids = await readIndex();
  if (ids.length) await AsyncStorage.multiRemove(ids.map(convKey));
  await AsyncStorage.removeItem(INDEX_KEY);
}
