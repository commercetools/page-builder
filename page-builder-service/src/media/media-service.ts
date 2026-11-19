/**
 * Upload and browse: the rules that sit between an HTTP request and the store.
 *
 * An upload is accepted only when its declared type is on the allowlist and the file's own bytes agree
 * with it. Whatever the store throws is replaced by a generic 502 carrying the cause; callers log a
 * `reasonOf(cause)` and never the cause itself, because SDK errors can carry request credentials.
 */

import { MediaError } from './errors.js';
import { buildObjectKey, listPrefix, newObjectId, sanitizeFileName } from './keys.js';
import { canonicalMime, extensionFor, kindOf, sniffMime, type MediaKind } from './mime.js';
import type { MediaFile, MediaStore } from './store.js';

export interface UploadResult {
  url: string;
  key: string;
  name: string;
  size: number;
  contentType: string;
}

export interface ListResult {
  files: MediaFile[];
  nextCursor: string | null;
}

export interface MediaService {
  /** The size cap an upload is read under; the route enforces it while streaming. */
  readonly maxUploadBytes: number;
  upload(file: { buffer: Buffer; filename: string; mimetype: string }): Promise<UploadResult>;
  list(query: { kind: MediaKind; limit: number; cursor?: string }): Promise<ListResult>;
}

export interface MediaServiceDeps {
  config: { pathPrefix: string; allowedMimeTypes: ReadonlySet<string>; maxUploadBytes: number };
  /** Resolves the store on first use, so a missing SDK or bad credential surfaces as a 502, not at boot. */
  getStore: () => Promise<MediaStore>;
  now?: () => number;
  newId?: () => string;
}

/** An error name or code: enough to diagnose, never a message that may quote a credential. */
export function reasonOf(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: unknown; name?: unknown };
    if (e.code !== undefined) return String(e.code);
    if (typeof e.name === 'string') return e.name;
  }
  return 'Error';
}

const unavailable = (cause: unknown): MediaError =>
  new MediaError(502, 'storage_unavailable', 'Media storage is unavailable', { cause });

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? newObjectId;

  const store = async (): Promise<MediaStore> => {
    try {
      return await deps.getStore();
    } catch (err) {
      throw unavailable(err);
    }
  };

  return {
    maxUploadBytes: deps.config.maxUploadBytes,

    async upload({ buffer, filename, mimetype }) {
      const declared = canonicalMime(mimetype);
      if (!deps.config.allowedMimeTypes.has(declared)) {
        throw new MediaError(415, 'type_not_allowed', 'Content type is not allowed');
      }
      const sniffed = sniffMime(buffer);
      if (sniffed !== declared) {
        throw new MediaError(415, 'type_mismatch', 'File content does not match its declared type');
      }
      const key = buildObjectKey({
        prefix: deps.config.pathPrefix,
        kind: kindOf(sniffed),
        stem: sanitizeFileName(filename),
        ext: extensionFor(sniffed),
        nowMs: now(),
        id: newId(),
      });
      const target = await store();
      try {
        const stored = await target.put({ key, body: buffer, contentType: sniffed });
        return {
          url: stored.url,
          key: stored.key,
          name: stored.key.slice(stored.key.lastIndexOf('/') + 1),
          size: stored.size,
          contentType: stored.contentType,
        };
      } catch (err) {
        throw unavailable(err);
      }
    },

    async list({ kind, limit, cursor }) {
      const target = await store();
      try {
        return await target.list({ prefix: listPrefix(deps.config.pathPrefix, kind), limit, ...(cursor && { cursor }) });
      } catch (err) {
        // A continuation token the store does not recognise is the caller's fault, not an outage.
        if (cursor && (err as { code?: unknown }).code === 400) {
          throw new MediaError(400, 'invalid_cursor', 'Invalid cursor', { cause: err });
        }
        throw unavailable(err);
      }
    },
  };
}
