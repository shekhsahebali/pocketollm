import type { ChatMessage } from '@/types';

/**
 * Edit-and-resend rule: replace the targeted user message and drop it plus
 * everything after it (its reply gets regenerated). Pure so selfcheck can
 * cover it without pulling in native chat dependencies.
 * Returns null when the id isn't a user message.
 */
export function applyUserEdit(
  messages: ChatMessage[],
  messageId: string,
  text: string,
): ChatMessage[] | null {
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx < 0 || messages[idx].role !== 'user') return null;
  return [...messages.slice(0, idx), { ...messages[idx], content: text }];
}
