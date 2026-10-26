import { canonicalize, canonicalEqual } from './canonicalize';

describe('canonicalize', () => {
  it('is independent of object key order', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it('sorts keys recursively but keeps array order significant', () => {
    expect(canonicalize({ x: [{ b: 1, a: 2 }] })).toBe(
      canonicalize({ x: [{ a: 2, b: 1 }] })
    );
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it('handles primitives and null', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(5)).toBe('5');
    expect(canonicalize('x')).toBe('"x"');
    expect(canonicalize(true)).toBe('true');
  });

  it('canonicalEqual compares structurally, ignoring key order', () => {
    expect(canonicalEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(
      true
    );
    expect(canonicalEqual({ a: 1 }, { a: 2 })).toBe(false);
    // a localized-map settings value with reordered locales is still "equal"
    expect(
      canonicalEqual(
        { title: { 'en-US': 'Hi', 'de-DE': 'Hallo' } },
        { title: { 'de-DE': 'Hallo', 'en-US': 'Hi' } }
      )
    ).toBe(true);
  });
});
