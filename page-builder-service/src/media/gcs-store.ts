/**
 * Google Cloud Storage as the media store.
 *
 * Objects are read straight from `https://storage.googleapis.com/{bucket}/{key}`, so the bucket must
 * grant `allUsers` the Storage Object Viewer role (with uniform bucket-level access). The service only
 * ever writes and lists; it sets no per-object ACLs, which uniform-access buckets reject.
 *
 * The SDK is imported on first use, so a service with media switched off never loads it.
 */

import type { MediaConfig } from './config.js';
import type { ListInput, ListPage, MediaFile, MediaStore, PutInput, StoredObject } from './store.js';

interface GcsObjectMetadata {
  size?: string | number;
  timeCreated?: string;
  contentType?: string;
}

const encodeKey = (key: string): string => key.split('/').map(encodeURIComponent).join('/');

export async function createGcsStore(cfg: Pick<MediaConfig, 'bucket' | 'serviceAccount'>): Promise<MediaStore> {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage({
    ...(cfg.serviceAccount.project_id && { projectId: cfg.serviceAccount.project_id }),
    credentials: { client_email: cfg.serviceAccount.client_email, private_key: cfg.serviceAccount.private_key },
  });
  const bucket = storage.bucket(cfg.bucket);
  const urlFor = (key: string): string => `https://storage.googleapis.com/${cfg.bucket}/${encodeKey(key)}`;

  return {
    async put(input: PutInput): Promise<StoredObject> {
      await bucket.file(input.key).save(input.body, {
        resumable: false,
        contentType: input.contentType,
        // The key is unique per upload, so a cached copy can never go stale.
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      });
      return { key: input.key, url: urlFor(input.key), size: input.body.length, contentType: input.contentType };
    },

    async list(input: ListInput): Promise<ListPage> {
      const [files, next] = await bucket.getFiles({
        prefix: input.prefix,
        maxResults: input.limit,
        autoPaginate: false,
        ...(input.cursor && { pageToken: input.cursor }),
      });
      const mapped: MediaFile[] = files
        // A "folder" placeholder object is not a file.
        .filter((file) => !file.name.endsWith('/'))
        .map((file) => {
          const meta = file.metadata as GcsObjectMetadata;
          const size = meta.size === undefined ? Number.NaN : Number(meta.size);
          return {
            key: file.name,
            url: urlFor(file.name),
            name: file.name.slice(file.name.lastIndexOf('/') + 1),
            ...(Number.isFinite(size) && { size }),
            ...(meta.contentType && { contentType: meta.contentType }),
            ...(meta.timeCreated && { createdAt: meta.timeCreated }),
          };
        });
      const token = (next as { pageToken?: string } | null | undefined)?.pageToken;
      return { files: mapped, nextCursor: token ?? null };
    },
  };
}
