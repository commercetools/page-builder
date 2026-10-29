/**
 * Which uploads the service accepts, and how it recognises them.
 *
 * The declared content type is never trusted on its own: it must be on the allowlist AND match
 * what the first bytes of the file say it is. Only types with a signature below can be allowed,
 * which keeps scriptable formats (SVG, HTML) out of a bucket that is served publicly.
 */

export type MediaKind = 'image' | 'video' | 'file';

export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'video', 'file'];

/** Every type `sniffMime` can recognise, with the extension its object is stored under. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

export const SUPPORTED_MIME_TYPES: readonly string[] = Object.keys(EXTENSIONS);

export const DEFAULT_ALLOWED_MIME_TYPES: readonly string[] = SUPPORTED_MIME_TYPES;

export const extensionFor = (mime: string): string => EXTENSIONS[mime] ?? 'bin';

export function kindOf(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

/** `image/jpg` and parameters (`; charset=…`) are normalised away. */
export function canonicalMime(declared: string): string {
  const base = (declared.split(';')[0] ?? '').trim().toLowerCase();
  return base === 'image/jpg' ? 'image/jpeg' : base;
}

const startsWith = (buf: Buffer, bytes: number[]): boolean =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

const ascii = (buf: Buffer, start: number, end: number): string => buf.subarray(start, end).toString('latin1');

/** ISO base media brands that mean "an MP4 video"; `avif`/`avis` are images, and anything else is unknown. */
const MP4_BRAND = /^(isom|iso[2-9]|mp4[12]|avc1|dash|M4V )$/;

/** The real type, from the first bytes. `null` when it is not one of the supported types. */
export function sniffMime(buf: Buffer): string | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  const gif = ascii(buf, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(buf, 0, 5) === '%PDF-') return 'application/pdf';
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (MP4_BRAND.test(brand)) return 'video/mp4';
  }
  return null;
}
