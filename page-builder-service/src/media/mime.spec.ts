import { describe, expect, it } from 'vitest';
import { canonicalMime, extensionFor, kindOf, sniffMime, SUPPORTED_MIME_TYPES } from './mime.js';

const bytes = (...b: number[]) => Buffer.from([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(`ftyp${brand}`, 'latin1'), Buffer.alloc(8)]);

describe('sniffMime', () => {
  it.each([
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ['image/gif', Buffer.from('GIF89a......')],
    ['image/gif', Buffer.from('GIF87a......')],
    ['image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])],
    ['image/avif', ftyp('avif')],
    ['image/avif', ftyp('avis')],
    ['video/mp4', ftyp('isom')],
    ['video/mp4', ftyp('mp42')],
    ['video/webm', bytes(0x1a, 0x45, 0xdf, 0xa3)],
    ['application/pdf', Buffer.from('%PDF-1.7\n')],
  ])('recognises %s', (mime, buffer) => {
    expect(sniffMime(buffer)).toBe(mime);
  });

  it.each([
    ['plain text', Buffer.from('hello world')],
    ['an SVG, which can carry script', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['HTML', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['an ISO media brand that is neither video nor avif (heic)', ftyp('heic')],
    ['an empty file', Buffer.alloc(0)],
    ['a truncated PNG signature', bytes(0x89, 0x50)],
  ])('refuses %s', (_label, buffer) => {
    expect(sniffMime(buffer)).toBeNull();
  });
});

describe('canonicalMime', () => {
  it('drops parameters, case and the image/jpg alias', () => {
    expect(canonicalMime('IMAGE/PNG; charset=binary')).toBe('image/png');
    expect(canonicalMime('image/jpg')).toBe('image/jpeg');
    expect(canonicalMime('')).toBe('');
  });
});

describe('kindOf and extensionFor', () => {
  it('groups types into the kinds a field asks for', () => {
    expect(kindOf('image/webp')).toBe('image');
    expect(kindOf('video/mp4')).toBe('video');
    expect(kindOf('application/pdf')).toBe('file');
  });

  it('knows an extension for every supported type', () => {
    for (const mime of SUPPORTED_MIME_TYPES) expect(extensionFor(mime)).not.toBe('bin');
    expect(extensionFor('text/plain')).toBe('bin');
  });
});
