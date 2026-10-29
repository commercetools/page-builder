/**
 * Object keys: `{prefix}/{images|videos|files}/{reverse-timestamp}-{id}-{name}.{ext}`.
 *
 * The kind folder makes "list the images" a plain prefix listing, so paging is exact and needs no
 * filtering. The reverse timestamp sorts newest first in key order, which is how the library is shown.
 * The id keeps two uploads in the same millisecond, or of the same name, apart.
 */

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { MediaKind } from './mime.js';

const FOLDERS: Readonly<Record<MediaKind, string>> = { image: 'images', video: 'videos', file: 'files' };

/** The file name stem (no directory, no extension) limited to `[A-Za-z0-9._-]`, so a key is always URL-safe. */
export function sanitizeFileName(original: string): string {
  const base = path.posix.basename(original.replace(/\\/g, '/'));
  const cleaned = path.posix
    .parse(base)
    .name.normalize('NFKD')
    // Decomposed accents are marks of their own: drop them so "Ångström" reads "Angstrom", not "A-ngstro-m".
    .replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return cleaned || 'file';
}

const reverseTimestamp = (nowMs: number): string => String(9999999999999 - nowMs).padStart(13, '0');

export const newObjectId = (): string => randomBytes(4).toString('hex');

export function buildObjectKey(i: { prefix: string; kind: MediaKind; stem: string; ext: string; nowMs: number; id: string }): string {
  return `${i.prefix}/${FOLDERS[i.kind]}/${reverseTimestamp(i.nowMs)}-${i.id}-${i.stem}.${i.ext}`;
}

/** The trailing slash keeps `images` from matching a sibling folder that merely starts with it. */
export const listPrefix = (prefix: string, kind: MediaKind): string => `${prefix}/${FOLDERS[kind]}/`;
