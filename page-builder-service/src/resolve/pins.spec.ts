import { describe, expect, it } from 'vitest';
import { applyPins, readPins } from './pins.js';

const item = (id: string) => ({ id });

describe('readPins', () => {
  it('normalises current and legacy shapes, sorted by position', () => {
    expect(
      readPins([
        { position: 3, id: 'c' },
        { position: 1, productId: 'a' },
        { position: 2.7, id: 'b' },
      ])
    ).toEqual([
      { position: 1, id: 'a' },
      { position: 2, id: 'b' },
      { position: 3, id: 'c' },
    ]);
  });

  it('drops malformed entries and non-arrays', () => {
    expect(readPins([{ position: 0, id: 'x' }, { position: 'a', id: 'y' }, { position: 1 }, null, 'z', { position: 1, id: 7 }])).toEqual([]);
    expect(readPins(undefined)).toEqual([]);
    expect(readPins({})).toEqual([]);
  });
});

describe('applyPins', () => {
  const items = ['a', 'b', 'c', 'd'].map(item);

  it('returns the list cut to the limit when nothing is pinned', () => {
    expect(applyPins(items, [], [], 2)).toEqual([item('a'), item('b')]);
    expect(applyPins(items, [{ position: 1, id: 'z' }], [], 3).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('places pinned items at their 1-based positions and fills the rest from the list', () => {
    const out = applyPins(items, [{ position: 2, id: 'z' }], [item('z')], 4);
    expect(out.map((i) => i.id)).toEqual(['a', 'z', 'b', 'c']);
  });

  it('removes a pinned item that also appears in the list', () => {
    const out = applyPins(items, [{ position: 1, id: 'c' }], [item('c')], 4);
    expect(out.map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('clamps a position past the end and applies the limit last', () => {
    expect(applyPins(items, [{ position: 99, id: 'z' }], [item('z')], 10).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'z']);
    expect(applyPins(items, [{ position: 99, id: 'z' }], [item('z')], 4).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores pins whose item could not be loaded, and duplicate pins of one item', () => {
    const out = applyPins(
      items,
      [
        { position: 1, id: 'gone' },
        { position: 2, id: 'z' },
        { position: 3, id: 'z' },
      ],
      [item('z')],
      5
    );
    expect(out.map((i) => i.id)).toEqual(['a', 'z', 'b', 'c', 'd']);
  });

  it('keeps several pins in position order', () => {
    const out = applyPins(items, [{ position: 1, id: 'y' }, { position: 3, id: 'z' }], [item('y'), item('z')], 6);
    expect(out.map((i) => i.id)).toEqual(['y', 'a', 'z', 'b', 'c', 'd']);
  });
});
