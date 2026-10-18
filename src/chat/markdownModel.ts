import { marked, type Token, type Tokens } from 'marked';

/**
 * Minimal markdown model for chat bubbles: paragraphs, headings, bold/italic,
 * inline code, fenced code blocks, lists, blockquotes, links. Tables flatten
 * to pipe-joined lines (ponytail: real table layout if models start leaning
 * on them). Parsed here — pure, selfcheck-covered — so the RN renderer stays
 * a dumb tree walk.
 */
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'br' };

export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'code'; text: string; lang: string }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'hr' }
  | { type: 'text'; text: string };

export function toBlocks(markdown: string): Block[] {
  return blocksFrom(marked.lexer(markdown));
}

function inlines(tokens: Token[] | undefined): Inline[] {
  if (!tokens) return [];
  const out: Inline[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        // Plain runs can carry nested inline tokens (strong/em inside).
        if (t.tokens && t.tokens.length > 0) out.push(...inlines(t.tokens));
        else if (t.text) out.push({ type: 'text', text: t.text });
        break;
      case 'strong':
        out.push({ type: 'strong', children: inlines(t.tokens) });
        break;
      case 'em':
        out.push({ type: 'em', children: inlines(t.tokens) });
        break;
      case 'codespan':
        out.push({ type: 'code', text: t.text });
        break;
      case 'br':
        out.push({ type: 'br' });
        break;
      case 'link':
        out.push({ type: 'link', href: t.href, children: inlines(t.tokens) });
        break;
      case 'escape':
        if (t.text) out.push({ type: 'text', text: t.text });
        break;
      case 'del':
        // ~~strike~~: inner text survives; strikethrough styling skipped.
        out.push(...inlines(t.tokens));
        break;
      case 'html':
        if (t.text) out.push({ type: 'text', text: t.text });
        break;
      default:
        if ('text' in t && typeof t.text === 'string' && t.text) {
          out.push({ type: 'text', text: t.text });
        }
    }
  }
  return out;
}

function listItemInlines(item: Tokens.ListItem): Inline[] {
  const out: Inline[] = [];
  for (const t of item.tokens) {
    if ((t.type === 'paragraph' || t.type === 'text') && t.tokens && t.tokens.length > 0) {
      out.push(...inlines(t.tokens));
    } else if ('text' in t && t.text) {
      out.push({ type: 'text', text: t.text });
    }
  }
  return out;
}

function blocksFrom(tokens: Token[]): Block[] {
  const out: Block[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'space':
        break;
      case 'paragraph': {
        const inl = inlines(t.tokens);
        if (inl.length) out.push({ type: 'paragraph', inlines: inl });
        break;
      }
      case 'heading': {
        const inl = inlines(t.tokens);
        if (inl.length) out.push({ type: 'heading', inlines: inl });
        break;
      }
      case 'code':
        out.push({ type: 'code', text: t.text, lang: t.lang ?? '' });
        break;
      case 'list':
        out.push({
          type: 'list',
          ordered: t.ordered,
          items: t.items.map((item: Tokens.ListItem) => listItemInlines(item)),
        });
        break;
      case 'blockquote':
        out.push({ type: 'quote', blocks: blocksFrom(t.tokens ?? []) });
        break;
      case 'hr':
        out.push({ type: 'hr' });
        break;
      case 'table': {
        // ponytail: tables flatten to pipe-joined lines — upgrade: real layout.
        const header = t.header.map((c: Tokens.TableCell) => c.text).join(' | ');
        if (header) out.push({ type: 'paragraph', inlines: [{ type: 'text', text: header }] });
        for (const row of t.rows) {
          out.push({
            type: 'paragraph',
            inlines: [{ type: 'text', text: row.map((c: Tokens.TableCell) => c.text).join(' | ') }],
          });
        }
        break;
      }
      case 'text':
      case 'html': {
        const inl = 'tokens' in t && t.tokens ? inlines(t.tokens) : inlines([t]);
        if (inl.length) out.push({ type: 'paragraph', inlines: inl });
        break;
      }
      default: {
        const raw = 'text' in t && typeof t.text === 'string' ? t.text : '';
        if (raw.trim()) out.push({ type: 'paragraph', inlines: [{ type: 'text', text: raw }] });
      }
    }
  }
  return out;
}
