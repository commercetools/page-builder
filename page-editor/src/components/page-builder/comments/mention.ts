/**
 * @-mention parsing/rendering helpers. A mention is the sigil `@` immediately
 * followed by an email address, e.g. `@jane@acme.com`. A bare email without the
 * leading `@` is NOT a mention, so ordinary emails in prose aren't highlighted.
 */

// Capture group is the email itself (used as the mention identity).
export const MENTION_REGEX =
  /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

/** Unique, lowercased mention emails found in a comment body. */
export const parseMentions = (body: string): string[] => {
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_REGEX)) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
};

export type BodyToken = {
  text: string;
  isMention: boolean;
  email?: string;
  /** Character offset of `text` in the body — the token's stable render key. */
  start: number;
};

/** Split a body into ordered plain/mention segments for rendering. */
export const tokenizeBody = (body: string): BodyToken[] => {
  const tokens: BodyToken[] = [];
  const re = new RegExp(MENTION_REGEX.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      tokens.push({
        text: body.slice(last, m.index),
        isMention: false,
        start: last,
      });
    }
    tokens.push({
      text: m[0],
      isMention: true,
      email: m[1],
      start: m.index,
    });
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    tokens.push({ text: body.slice(last), isMention: false, start: last });
  }
  return tokens;
};

/**
 * Given the textarea value + caret offset, return the in-progress `@query`
 * fragment (text typed after the nearest `@` on the current run of non-space
 * characters), or null when the caret isn't inside a mention.
 */
export const findActiveMentionQuery = (
  value: string,
  caret: number
): { query: string; start: number } | null => {
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(value[i])) i--;
  const start = i + 1;
  const token = value.slice(start, caret);
  if (!token.startsWith('@')) return null;
  return { query: token.slice(1), start };
};

/**
 * Replace the active `@query` fragment [start, caret) with a completed
 * `@<email> ` token, returning the new value + caret position.
 */
export const applyMention = (
  value: string,
  start: number,
  caret: number,
  email: string
): { value: string; caret: number } => {
  const inserted = `@${email} `;
  const next = value.slice(0, start) + inserted + value.slice(caret);
  return { value: next, caret: start + inserted.length };
};
