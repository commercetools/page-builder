/**
 * An in-memory stand-in for the page-builder service's media API, installed with
 * `setServiceRequestForTests`, so a spec drives the real client, hooks and components with no
 * network. It pages like the service does (a continuation `cursor`) and can be told to refuse.
 */

import type { MediaFile, MediaKind } from '../service/media';
import type { ServiceRequest } from '../service/service-link';

export type SeedFile = Partial<MediaFile> & { name: string; kind?: MediaKind };

export type FakeMediaService = {
  request: ServiceRequest;
  /** Every call made, as `METHOD kind` (lists) or `POST filename` (uploads). */
  calls: string[];
  /** The files held, newest first. */
  files: MediaFile[];
  /** Answer every call with this refusal, until `refuse(null)`. */
  refuse: (
    failure: { status: number; code: string; message?: string } | null
  ) => void;
  /** Hold uploads until the returned function is called. */
  holdUploads: () => () => void;
};

export function createFakeMediaService(
  seed: SeedFile[] = [],
  { pageSize = 24 }: { pageSize?: number } = {}
): FakeMediaService {
  const kinds = new Map<string, MediaKind>();
  const files: MediaFile[] = seed.map((s) => {
    const file: MediaFile = {
      key: s.key ?? `media/${s.name}`,
      url: s.url ?? `https://storage.test/${s.name}`,
      name: s.name,
    };
    kinds.set(file.key, s.kind ?? 'image');
    return file;
  });
  const calls: string[] = [];
  let refusal: { status: number; code: string; message?: string } | null = null;
  let gate: Promise<void> | null = null;

  const request: ServiceRequest = async ({ method, path, query, body }) => {
    if (path !== '/v1/admin/media') {
      return {
        status: 404,
        json: { error: { code: 'not_found', message: 'Route not found' } },
      };
    }
    if (method === 'GET') calls.push(`GET ${String(query?.type)}`);
    else calls.push(`POST ${((body as FormData).get('file') as File).name}`);

    if (refusal) {
      return {
        status: refusal.status,
        json: {
          error: { code: refusal.code, message: refusal.message ?? 'Refused' },
        },
      };
    }

    if (method === 'GET') {
      const matching = files.filter((f) => kinds.get(f.key) === query?.type);
      const start = query?.cursor ? Number(query.cursor) : 0;
      const end = start + pageSize;
      return {
        status: 200,
        json: {
          files: matching.slice(start, end),
          nextCursor: end < matching.length ? String(end) : null,
        },
      };
    }

    await gate;
    const upload = (body as FormData).get('file') as File;
    const stored: MediaFile = {
      key: `media/${upload.name}`,
      url: `https://storage.test/stored/${upload.name}`,
      name: upload.name,
      size: upload.size,
      contentType: upload.type,
    };
    kinds.set(stored.key, upload.type.startsWith('video/') ? 'video' : 'image');
    files.unshift(stored);
    return { status: 201, json: stored };
  };

  return {
    request,
    calls,
    files,
    refuse: (failure) => {
      refusal = failure;
    },
    holdUploads: () => {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}
