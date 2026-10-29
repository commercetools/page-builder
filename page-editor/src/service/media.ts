/**
 * The page-builder service's media API (`GET`/`POST /v1/admin/media`), as the editor calls it: through
 * whatever `ServiceRequest` the transport hands in (the MC gateway's `forward-to` in the app, an
 * in-process stand-in under test). Authentication is the gateway's — nothing here holds a credential.
 */

import type { ServiceRequest } from './service-link';

export type MediaKind = 'image' | 'video' | 'file';

export type MediaFile = {
  key: string;
  /** Where a browser reads the file from; this is the value a page stores. */
  url: string;
  name: string;
  size?: number;
  contentType?: string;
  createdAt?: string;
};

export type MediaPage = { files: MediaFile[]; nextCursor: string | null };

/** The service refused the call. `code` is its stable error code (`file_too_large`, …). */
export class MediaServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'MediaServiceError';
  }
}

export const MEDIA_NOT_CONFIGURED = 'media_not_configured';

export const isMediaNotConfigured = (err: unknown): boolean =>
  err instanceof MediaServiceError && err.code === MEDIA_NOT_CONFIGURED;

/** What a caller shows when a call fails: the service's code, and a message to fall back on. */
export type MediaFailure = { code: string; message: string };

export function toMediaFailure(err: unknown): MediaFailure {
  if (err instanceof MediaServiceError) {
    return { code: err.code, message: err.message };
  }
  return {
    code: 'network',
    message: err instanceof Error ? err.message : 'Request failed',
  };
}

export type MediaClient = {
  list(
    kind: MediaKind,
    options?: { cursor?: string; limit?: number }
  ): Promise<MediaPage>;
  upload(file: File): Promise<MediaFile>;
};

const PATH = '/v1/admin/media';

type ErrorBody = { error?: { code?: unknown; message?: unknown } };

function failure(status: number, json: unknown): MediaServiceError {
  const error = (json as ErrorBody | undefined)?.error;
  // A 413 with no body of ours came from a proxy in front of the service, which has its own size cap.
  const fallbackCode = status === 413 ? 'file_too_large' : 'unknown';
  return new MediaServiceError(
    status,
    typeof error?.code === 'string' ? error.code : fallbackCode,
    typeof error?.message === 'string'
      ? error.message
      : `The media service answered ${status}`
  );
}

export function createMediaClient(request: ServiceRequest): MediaClient {
  return {
    async list(kind, { cursor, limit } = {}) {
      const res = await request({
        method: 'GET',
        path: PATH,
        query: { type: kind, limit, cursor },
      });
      if (res.status !== 200) throw failure(res.status, res.json);
      return res.json as MediaPage;
    },

    async upload(file) {
      const body = new FormData();
      body.append('file', file, file.name);
      const res = await request({ method: 'POST', path: PATH, body });
      if (res.status !== 201) throw failure(res.status, res.json);
      return res.json as MediaFile;
    },
  };
}
