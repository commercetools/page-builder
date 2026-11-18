import { beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn();
const file = vi.fn(() => ({ save }));
const getFiles = vi.fn();
const bucket = vi.fn(() => ({ file, getFiles }));
const Storage = vi.fn(function (_options: Record<string, unknown>) {
  return { bucket };
});
vi.mock('@google-cloud/storage', () => ({ Storage }));

const { createGcsStore } = await import('./gcs-store.js');

const account = { client_email: 'svc@p.iam.gserviceaccount.com', private_key: 'PEM', project_id: 'p' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGcsStore', () => {
  it('builds the client from the service-account key only', async () => {
    await createGcsStore({ bucket: 'media', serviceAccount: account });
    expect(Storage).toHaveBeenCalledWith({
      projectId: 'p',
      credentials: { client_email: account.client_email, private_key: 'PEM' },
    });
    expect(bucket).toHaveBeenCalledWith('media');
  });

  it('leaves the project to the key when it names none', async () => {
    await createGcsStore({ bucket: 'media', serviceAccount: { client_email: 'a', private_key: 'b' } });
    expect(Storage.mock.calls[0]![0]).not.toHaveProperty('projectId');
  });

  describe('put', () => {
    it('stores the bytes with a long-lived cache header and returns the public URL', async () => {
      const store = await createGcsStore({ bucket: 'media', serviceAccount: account });
      const body = Buffer.from('png-bytes');

      const stored = await store.put({ key: 'page-builder/media/images/1-a-my photo.png', body, contentType: 'image/png' });

      expect(file).toHaveBeenCalledWith('page-builder/media/images/1-a-my photo.png');
      expect(save).toHaveBeenCalledWith(body, {
        resumable: false,
        contentType: 'image/png',
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      });
      expect(stored).toEqual({
        key: 'page-builder/media/images/1-a-my photo.png',
        url: 'https://storage.googleapis.com/media/page-builder/media/images/1-a-my%20photo.png',
        size: body.length,
        contentType: 'image/png',
      });
    });

    it('does not set a per-object ACL, which uniform bucket-level access rejects', async () => {
      const store = await createGcsStore({ bucket: 'media', serviceAccount: account });
      await store.put({ key: 'k.png', body: Buffer.from('x'), contentType: 'image/png' });
      const options = save.mock.calls[0]![1] as Record<string, unknown>;
      expect(options).not.toHaveProperty('public');
      expect(options).not.toHaveProperty('predefinedAcl');
    });

    it('lets a storage failure reach the caller', async () => {
      save.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 503 }));
      const store = await createGcsStore({ bucket: 'media', serviceAccount: account });
      await expect(store.put({ key: 'k', body: Buffer.from('x'), contentType: 'image/png' })).rejects.toMatchObject({ code: 503 });
    });
  });

  describe('list', () => {
    const object = (name: string, metadata: Record<string, unknown> = {}) => ({ name, metadata });

    it('maps objects and passes the prefix, limit and page token through', async () => {
      getFiles.mockResolvedValueOnce([
        [
          object('p/images/', {}),
          object('p/images/2-b-two.png', { size: '2048', contentType: 'image/png', timeCreated: '2026-10-28T10:00:00Z' }),
          object('p/images/1-a-one.jpg', {}),
        ],
        { pageToken: 'next-token' },
      ]);
      const store = await createGcsStore({ bucket: 'media', serviceAccount: account });

      const page = await store.list({ prefix: 'p/images/', limit: 2, cursor: 'tok' });

      expect(getFiles).toHaveBeenCalledWith({ prefix: 'p/images/', maxResults: 2, autoPaginate: false, pageToken: 'tok' });
      expect(page.nextCursor).toBe('next-token');
      expect(page.files).toEqual([
        {
          key: 'p/images/2-b-two.png',
          url: 'https://storage.googleapis.com/media/p/images/2-b-two.png',
          name: '2-b-two.png',
          size: 2048,
          contentType: 'image/png',
          createdAt: '2026-10-28T10:00:00Z',
        },
        { key: 'p/images/1-a-one.jpg', url: 'https://storage.googleapis.com/media/p/images/1-a-one.jpg', name: '1-a-one.jpg' },
      ]);
    });

    it('reports the last page as having no cursor, and sends no token on the first', async () => {
      getFiles.mockResolvedValueOnce([[], null]);
      const store = await createGcsStore({ bucket: 'media', serviceAccount: account });

      expect(await store.list({ prefix: 'p/', limit: 5 })).toEqual({ files: [], nextCursor: null });
      expect(getFiles.mock.calls[0]![0]).not.toHaveProperty('pageToken');
    });
  });
});
