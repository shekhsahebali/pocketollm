/** Local, deterministic title rule — no model inference. */
export function titleFromFirstMessage(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (clean.length <= 40) return clean || 'New chat';
  return `${clean.slice(0, 40)}…`;
}
