import { describe, expect, it, vi } from 'vitest';
import { MediaError } from './errors.js';
import { createMediaService, reasonOf } from './media-service.js';
import type { MediaStore } from './store.js';
import { createMemoryMediaStore } from '../testing/memory-media-store.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(16)]);

const config = {
  pathPrefix: 'page-builder/media',
  maxUploadBytes: 1024 * 1024,
  allowedMimeTypes: new Set(['image/png', 'video/mp4', 'application/pdf']),
};

const serviceFor = (store: MediaStore) =>
  createMediaService({ config, getStore: async () => store, now: () => 1_700_000_000_000, newId: () => 'abcd1234' });

function setup() {
  const store = createMemoryMediaStore();
  return { service: serviceFor(store), store };
}

const thrown = async (promise: Promise<unknown>): Promise<MediaError> => {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(MediaError);
  return err as MediaError;
};

describe('upload', () => {
  it('stores the file under its kind and returns where to read it', async () => {
    const { service, store } = setup();

    const result = await service.upload({ buffer: PNG, filename: 'My Hero.PNG', mimetype: 'image/png' });

    expect(result).toEqual({
      key: 'page-builder/media/images/8299999999999-abcd1234-My-Hero.png',
      url: 'https://storage.test/bucket/page-builder/media/images/8299999999999-abcd1234-My-Hero.png',
      name: '8299999999999-abcd1234-My-Hero.png',
      size: PNG.length,
      contentType: 'image/png',
    });
    expect(store.objects.get(result.key)).toMatchObject({ contentType: 'image/png' });
  });

  it('files a video under videos and a pdf under files', async () => {
    const { service } = setup();
    expect((await service.upload({ buffer: MP4, filename: 'clip.mp4', mimetype: 'video/mp4' })).key).toContain('/videos/');
    expect((await service.upload({ buffer: Buffer.from('%PDF-1.4'), filename: 'a.pdf', mimetype: 'application/pdf' })).key).toContain('/files/');
  });

  it('stores what the bytes say, not the spelling the client used', async () => {
    const { service } = setup();
    const result = await service.upload({ buffer: PNG, filename: 'x', mimetype: 'IMAGE/PNG; charset=binary' });
    expect(result.contentType).toBe('image/png');
  });

  it('refuses a type that is not on the allowlist', async () => {
    const { service, store } = setup();
    const err = await thrown(service.upload({ buffer: Buffer.from('GIF89a......'), filename: 'x.gif', mimetype: 'image/gif' }));
    expect(err).toMatchObject({ status: 415, code: 'type_not_allowed' });
    expect(store.objects.size).toBe(0);
  });

  it('refuses a file whose bytes are not the type it claims', async () => {
    const { service, store } = setup();
    const err = await thrown(service.upload({ buffer: Buffer.from('<script>alert(1)</script>'), filename: 'x.png', mimetype: 'image/png' }));
    expect(err).toMatchObject({ status: 415, code: 'type_mismatch' });
    // A real file of a different allowed type is a mismatch too.
    expect(await thrown(service.upload({ buffer: MP4, filename: 'x.png', mimetype: 'image/png' }))).toMatchObject({ code: 'type_mismatch' });
    expect(store.objects.size).toBe(0);
  });

  it('answers 502 and keeps the cause out of the message when the store fails', async () => {
    const cause = Object.assign(new Error('Bearer ya29.secret'), { code: 503 });
    const service = serviceFor({ put: vi.fn().mockRejectedValue(cause), list: vi.fn() });
    const err = await thrown(service.upload({ buffer: PNG, filename: 'x.png', mimetype: 'image/png' }));
    expect(err).toMatchObject({ status: 502, code: 'storage_unavailable', cause });
    expect(err.message).not.toContain('secret');
  });

  it('answers 502 when the store cannot even be built', async () => {
    const service = createMediaService({
      config,
      getStore: async () => {
        throw new Error('SDK missing');
      },
    });
    expect(await thrown(service.upload({ buffer: PNG, filename: 'x.png', mimetype: 'image/png' }))).toMatchObject({ status: 502 });
    expect(await thrown(service.list({ kind: 'image', limit: 5 }))).toMatchObject({ status: 502 });
  });

  it('exposes the size cap the route reads uploads under', () => {
    expect(setup().service.maxUploadBytes).toBe(1024 * 1024);
  });
});

describe('list', () => {
  it('lists one kind, newest first, a page at a time', async () => {
    const store = createMemoryMediaStore();
    // Each upload is stamped with its own clock reading, which the object id repeats.
    const uploadAt = (ms: number, buffer: Buffer, filename: string, mimetype: string) =>
      createMediaService({ config, getStore: async () => store, now: () => ms, newId: () => String(ms) }).upload({ buffer, filename, mimetype });
    const ids = (files: { name: string }[]) => files.map((f) => f.name.split('-')[1]);

    for (const ms of [1_700_000_001_000, 1_700_000_003_000, 1_700_000_002_000]) await uploadAt(ms, PNG, `n${ms}.png`, 'image/png');
    await uploadAt(1_700_000_004_000, MP4, 'v.mp4', 'video/mp4');
    const service = serviceFor(store);

    const first = await service.list({ kind: 'image', limit: 2 });
    expect(ids(first.files)).toEqual(['1700000003000', '1700000002000']);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.list({ kind: 'image', limit: 2, cursor: first.nextCursor! });
    expect(ids(second.files)).toEqual(['1700000001000']);
    expect(second.nextCursor).toBeNull();

    expect((await service.list({ kind: 'video', limit: 10 })).files).toHaveLength(1);
    expect((await service.list({ kind: 'file', limit: 10 })).files).toHaveLength(0);
  });

  it('treats a continuation token the store rejects as the caller\'s mistake', async () => {
    const rejected = Object.assign(new Error('Invalid pageToken'), { code: 400 });
    const service = serviceFor({ put: vi.fn(), list: vi.fn().mockRejectedValue(rejected) });
    expect(await thrown(service.list({ kind: 'image', limit: 5, cursor: 'forged' }))).toMatchObject({ status: 400, code: 'invalid_cursor' });
  });

  it('does not blame the caller for a 400 when no token was sent', async () => {
    const odd = Object.assign(new Error('bad request'), { code: 400 });
    const service = serviceFor({ put: vi.fn(), list: vi.fn().mockRejectedValue(odd) });
    expect(await thrown(service.list({ kind: 'image', limit: 5 }))).toMatchObject({ status: 502, code: 'storage_unavailable' });
  });

  it('answers 502 when the store is down', async () => {
    const service = serviceFor({ put: vi.fn(), list: vi.fn().mockRejectedValue(new Error('down')) });
    expect(await thrown(service.list({ kind: 'image', limit: 5, cursor: 'tok' }))).toMatchObject({ status: 502 });
  });
});

describe('reasonOf', () => {
  it('reports a code or a name, never a message', () => {
    expect(reasonOf({ code: 403, message: 'Bearer secret' })).toBe('403');
    expect(reasonOf(new TypeError('Bearer secret'))).toBe('TypeError');
    expect(reasonOf('Bearer secret')).toBe('Error');
    expect(reasonOf({})).toBe('Error');
    expect(reasonOf(null)).toBe('Error');
  });
});
