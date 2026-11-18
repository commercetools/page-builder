import { tokenizeBody, parseMentions } from './mention';

describe('tokenizeBody', () => {
  it('returns one plain token for a body with no mentions', () => {
    expect(tokenizeBody('hello there')).toEqual([
      { text: 'hello there', isMention: false, start: 0 },
    ]);
  });

  it('splits a mention out of surrounding prose', () => {
    expect(tokenizeBody('hi @jane@acme.com bye')).toEqual([
      { text: 'hi ', isMention: false, start: 0 },
      {
        text: '@jane@acme.com',
        isMention: true,
        email: 'jane@acme.com',
        start: 3,
      },
      { text: ' bye', isMention: false, start: 17 },
    ]);
  });

  it('does not treat a bare email as a mention', () => {
    const tokens = tokenizeBody('mail jane@acme.com please');
    expect(tokens.every((t) => !t.isMention)).toBe(true);
  });

  // `start` is the render key. Two tokens with the same text must still differ,
  // which is the whole reason the offset is carried through.
  it('gives repeated identical text distinct offsets', () => {
    const tokens = tokenizeBody('@a@x.com and @a@x.com');
    const mentions = tokens.filter((t) => t.isMention);
    expect(mentions).toHaveLength(2);
    expect(mentions[0].start).not.toBe(mentions[1].start);
  });

  it('offsets always index back into the original body', () => {
    const body = 'a @one@x.com b @two@y.com c';
    for (const t of tokenizeBody(body)) {
      expect(body.slice(t.start, t.start + t.text.length)).toBe(t.text);
    }
  });

  it('handles a body that is only a mention, and an empty body', () => {
    expect(tokenizeBody('@a@x.com')).toEqual([
      { text: '@a@x.com', isMention: true, email: 'a@x.com', start: 0 },
    ]);
    expect(tokenizeBody('')).toEqual([]);
  });

  it('concatenating the tokens reproduces the body', () => {
    const body = 'start @a@x.com middle @b@y.com end';
    expect(
      tokenizeBody(body)
        .map((t) => t.text)
        .join('')
    ).toBe(body);
  });
});

describe('parseMentions', () => {
  it('lowercases and de-duplicates', () => {
    expect(parseMentions('@Jane@Acme.com and @jane@acme.com')).toEqual([
      'jane@acme.com',
    ]);
  });

  it('returns nothing for prose without mentions', () => {
    expect(parseMentions('no one here')).toEqual([]);
  });
});
