import { describe, expect, it } from 'vitest';
import { buildObjectKey, listPrefix, newObjectId, sanitizeFileName } from './keys.js';

describe('sanitizeFileName', () => {
  it.each([
    ['Hero Banner (final).PNG', 'Hero-Banner-final'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\photo.jpeg', 'photo'],
    ['ÅngströmÜber.jpg', 'AngstromUber'],
    ['....', 'file'],
    ['', 'file'],
    ['a'.repeat(200) + '.png', 'a'.repeat(80)],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('only ever yields characters that are safe in a URL path', () => {
    expect(sanitizeFileName('we ird/näme?#%.png')).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('object keys', () => {
  const base = { prefix: 'page-builder/media', stem: 'hero', ext: 'png', id: 'abcd1234' };

  it('puts each kind in its own folder', () => {
    expect(buildObjectKey({ ...base, kind: 'image', nowMs: 1_700_000_000_000 })).toBe('page-builder/media/images/8299999999999-abcd1234-hero.png');
    expect(buildObjectKey({ ...base, kind: 'video', ext: 'mp4', nowMs: 1_700_000_000_000 })).toMatch(/\/videos\/.*-hero\.mp4$/);
    expect(buildObjectKey({ ...base, kind: 'file', ext: 'pdf', nowMs: 1_700_000_000_000 })).toMatch(/\/files\/.*-hero\.pdf$/);
  });

  it('sorts newer uploads first', () => {
    const older = buildObjectKey({ ...base, kind: 'image', nowMs: 1_700_000_000_000 });
    const newer = buildObjectKey({ ...base, kind: 'image', nowMs: 1_700_000_005_000 });
    expect([older, newer].sort()).toEqual([newer, older]);
  });

  it('lists a kind by prefix, with a trailing slash so siblings never match', () => {
    expect(listPrefix('page-builder/media', 'image')).toBe('page-builder/media/images/');
  });

  it('mints distinct ids', () => {
    expect(newObjectId()).toMatch(/^[0-9a-f]{8}$/);
    expect(newObjectId()).not.toBe(newObjectId());
  });
});
