import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaConfig } from '../media/config.js';
import type { MediaStore } from '../media/store.js';
import { createMemoryMediaStore } from '../testing/memory-media-store.js';
import { mcKit } from '../testing/mc-kit.js';
import { testApp } from '../testing/fixtures.js';

const gcs = vi.hoisted(() => ({ createGcsStore: vi.fn() }));
vi.mock('../media/gcs-store.js', () => gcs);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(64)]);

const mediaConfig = (over: Partial<MediaConfig> = {}): MediaConfig => ({
  bucket: 'media',
  serviceAccount: { client_email: 'svc@p.iam.gserviceaccount.com', private_key: 'PRIVATE-KEY-MATERIAL' },
  pathPrefix: 'page-builder/media',
  maxUploadBytes: 8 * 1024 * 1024,
  allowedMimeTypes: new Set(['image/png', 'image/jpeg', 'video/mp4', 'application/pdf']),
  ...over,
});

type Part = { name: string; data: Buffer | string; filename?: string; type?: string };

/** A real multipart body, serialised the way a browser's `FormData` is. */
async function multipart(parts: Part[]) {
  const form = new FormData();
  for (const { name, data, filename, type } of parts) {
    if (filename === undefined && typeof data === 'string') form.append(name, data);
    else form.append(name, new Blob([data], { type: type ?? 'application/octet-stream' }), filename ?? 'upload');
  }
  const res = new Response(form);
  return { payload: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type')! };
}

async function setup(options: { config?: Partial<MediaConfig>; configured?: boolean; store?: MediaStore } = {}) {
  const kit = await mcKit();
  const store = options.store ?? createMemoryMediaStore();
  const logs: string[] = [];
  const t = testApp(
    {
      mc: { issuer: 'https://mc-api.test', audience: 'https://svc.test' },
      media: options.configured === false ? null : mediaConfig(options.config),
      logLevel: 'info',
    },
    { mcKeys: kit.keys as never, content: false, mediaStore: store, logStream: { write: (line) => logs.push(line) } }
  );
  const auth = { authorization: `Bearer ${await kit.sign()}` };

  const upload = async (parts: Part[], headers: Record<string, string> = auth) => {
    const { payload, contentType } = await multipart(parts);
    return t.app.inject({ method: 'POST', url: '/v1/admin/media', headers: { ...headers, 'content-type': contentType }, payload });
  };
  const file = (over: Partial<Part> = {}): Part => ({ name: 'file', data: PNG, filename: 'hero.png', type: 'image/png', ...over });
  const list = (query: string, headers: Record<string, string> = auth) => t.app.inject({ method: 'GET', url: `/v1/admin/media${query}`, headers });

  return { ...t, store, logs, auth, upload, list, file, kit };
}

beforeEach(() => {
  gcs.createGcsStore.mockReset();
});

describe('media API access', () => {
  it('is closed (503) when MC auth is not configured', async () => {
    const t = testApp({ media: mediaConfig() }, { content: false });
    const res = await t.app.inject({ method: 'GET', url: '/v1/admin/media?type=image' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('mc_auth_not_configured');
  });

  it('requires a Merchant Center token to upload or to browse', async () => {
    const { upload, list, file } = await setup();
    expect((await upload([file()], {})).statusCode).toBe(401);
    expect((await list('?type=image', {})).statusCode).toBe(401);
    expect((await list('?type=image', { authorization: 'Bearer not-a-jwt' })).statusCode).toBe(401);
  });

  it('rejects a token for another project', async () => {
    const { upload, kit, file, store } = await setup();
    const wrong = { authorization: `Bearer ${await kit.sign({ claims: { 'https://mc-api.test/claims/project_key': 'other' } })}` };
    expect((await upload([file()], wrong)).statusCode).toBe(401);
    expect((store as ReturnType<typeof createMemoryMediaStore>).objects.size).toBe(0);
  });

  it('answers 501 to an authenticated caller when media storage is not configured', async () => {
    const { upload, list, file } = await setup({ configured: false });
    const up = await upload([file()]);
    expect(up.statusCode).toBe(501);
    expect(up.json().error.code).toBe('media_not_configured');
    expect((await list('?type=image')).statusCode).toBe(501);
  });

  it('still asks an unauthenticated caller to sign in when media is not configured', async () => {
    const { list } = await setup({ configured: false });
    expect((await list('?type=image', {})).statusCode).toBe(401);
  });
});

describe('POST /v1/admin/media', () => {
  it('stores the file and returns where to read it', async () => {
    const { upload, store, file, logs } = await setup();

    const res = await upload([file()]);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ size: PNG.length, contentType: 'image/png' });
    expect(body.key).toMatch(/^page-builder\/media\/images\/\d{13}-[0-9a-f]{8}-hero\.png$/);
    expect(body.url).toBe(`https://storage.test/bucket/${body.key}`);
    expect(body.name).toBe(body.key.slice(body.key.lastIndexOf('/') + 1));
    expect((store as ReturnType<typeof createMemoryMediaStore>).objects.get(body.key)?.body.equals(PNG)).toBe(true);

    const audit = logs.map((l) => JSON.parse(l)).find((l) => l.audit);
    expect(audit).toMatchObject({ op: 'media.upload', key: body.key, actor: { userId: 'user-1', projectKey: 'us-store' } });
  });

  it('accepts an upload larger than the 5 MiB the JSON body limit allows', async () => {
    const { upload, file } = await setup();
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await upload([file({ data: big })]);
    expect(res.statusCode).toBe(201);
    expect(res.json().size).toBe(big.length);
  });

  it('refuses a file over the configured cap with 413, storing nothing', async () => {
    const { upload, store, file } = await setup({ config: { maxUploadBytes: 2048 } });
    const res = await upload([file({ data: Buffer.concat([PNG, Buffer.alloc(4096)]) })]);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('file_too_large');
    expect((store as ReturnType<typeof createMemoryMediaStore>).objects.size).toBe(0);
  });

  it('refuses a type that is not allowed with 415', async () => {
    const { upload, file } = await setup();
    const res = await upload([file({ data: Buffer.from('hi'), filename: 'a.txt', type: 'text/plain' })]);
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('type_not_allowed');
  });

  it('refuses a file that is not what it says it is with 415', async () => {
    const { upload, file, store } = await setup();
    const res = await upload([file({ data: Buffer.from('<script>alert(1)</script>'), filename: 'evil.png', type: 'image/png' })]);
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('type_mismatch');
    expect((store as ReturnType<typeof createMemoryMediaStore>).objects.size).toBe(0);
  });

  it('stores a video under videos', async () => {
    const { upload, file } = await setup();
    const res = await upload([file({ data: MP4, filename: 'clip.mp4', type: 'video/mp4' })]);
    expect(res.statusCode).toBe(201);
    expect(res.json().key).toContain('/videos/');
  });

  it.each([
    ['no file part', (): Part[] => []],
    ['a file under the wrong field name', (): Part[] => [{ name: 'upload', data: PNG, filename: 'a.png', type: 'image/png' }]],
  ])('asks for a "file" part when given %s', async (_label, parts) => {
    const { upload } = await setup();
    const res = await upload(parts());
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('file_required');
  });

  it('refuses a request that is not multipart', async () => {
    const { app, auth } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/media',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: { file: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('file_required');
  });

  it('stores only the first file and drops any extra fields or files unbuffered', async () => {
    const { upload, file, store } = await setup();
    const withField = await upload([{ name: 'title', data: 'hello' }, file()]);
    expect(withField.statusCode).toBe(201);

    const twoFiles = await upload([file({ filename: 'first.png' }), file({ filename: 'second.png' })]);
    expect(twoFiles.statusCode).toBe(201);
    expect(twoFiles.json().name).toMatch(/-first\.png$/);

    expect((store as ReturnType<typeof createMemoryMediaStore>).objects.size).toBe(2);
  });

  it('answers 400 to a multipart body that is cut off, and stores nothing', async () => {
    const { app, auth, store, file } = await setup();
    const { payload, contentType } = await multipart([file()]);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/media',
      headers: { ...auth, 'content-type': contentType },
      payload: payload.subarray(0, 40),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({ code: 'invalid_upload', message: 'The upload could not be read' });
    expect((store as ReturnType<typeof createMemoryMediaStore>).objects.size).toBe(0);
  });

  it('answers 502 without leaking the storage error, and logs only its code', async () => {
    const failing: MediaStore = {
      put: vi.fn().mockRejectedValue(Object.assign(new Error('Bearer ya29.SECRET-TOKEN in request'), { code: 503 })),
      list: vi.fn(),
    };
    const { upload, file, logs } = await setup({ store: failing });

    const res = await upload([file()]);

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: { code: 'storage_unavailable', message: 'Media storage is unavailable' } });
    const everything = logs.join('\n');
    expect(everything).not.toContain('SECRET-TOKEN');
    expect(everything).not.toContain('PRIVATE-KEY-MATERIAL');
    expect(logs.map((l) => JSON.parse(l)).find((l) => l.msg === 'media storage failed')).toMatchObject({ reason: '503' });
  });
});

describe('GET /v1/admin/media', () => {
  it('browses one kind a page at a time, newest first', async () => {
    const { upload, list, file } = await setup();
    for (const name of ['one', 'two', 'three']) {
      await upload([file({ filename: `${name}.png` })]);
      await new Promise((r) => setTimeout(r, 2));
    }
    await upload([file({ data: MP4, filename: 'clip.mp4', type: 'video/mp4' })]);

    const first = await list('?type=image&limit=2');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json().files.map((f: { name: string }) => f.name.replace(/^\d+-[0-9a-f]+-/, ''))).toEqual(['three.png', 'two.png']);
    expect(first.json().files[0]).toMatchObject({ contentType: 'image/png', size: PNG.length });

    const second = await list(`?type=image&limit=2&cursor=${encodeURIComponent(first.json().nextCursor)}`);
    expect(second.json().files.map((f: { name: string }) => f.name.replace(/^\d+-[0-9a-f]+-/, ''))).toEqual(['one.png']);
    expect(second.json().nextCursor).toBeNull();

    expect((await list('?type=video')).json().files).toHaveLength(1);
    expect((await list('?type=file')).json()).toEqual({ files: [], nextCursor: null });
  });

  it.each([
    ['no type', ''],
    ['an unknown type', '?type=audio'],
    ['a limit below 1', '?type=image&limit=0'],
    ['a limit above 100', '?type=image&limit=101'],
    ['an empty cursor', '?type=image&cursor='],
    ['an oversized cursor', `?type=image&cursor=${'x'.repeat(2049)}`],
  ])('rejects %s', async (_label, query) => {
    const { list } = await setup();
    expect((await list(query)).statusCode).toBe(400);
  });

  it('answers 400 for a continuation token the store does not recognise', async () => {
    const store: MediaStore = { put: vi.fn(), list: vi.fn().mockRejectedValue(Object.assign(new Error('Invalid pageToken'), { code: 400 })) };
    const { list } = await setup({ store });
    const res = await list('?type=image&cursor=forged');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_cursor');
  });

  it('answers 502 when the store is down', async () => {
    const store: MediaStore = { put: vi.fn(), list: vi.fn().mockRejectedValue(new Error('down')) };
    const { list } = await setup({ store });
    expect((await list('?type=image')).statusCode).toBe(502);
  });
});

describe('the Google Cloud Storage store', () => {
  /** No `mediaStore` override: the service builds the real adapter, here stood in for by `gcs`. */
  async function withoutOverride() {
    const kit = await mcKit();
    const t = testApp(
      { mc: { issuer: 'https://mc-api.test', audience: 'https://svc.test' }, media: mediaConfig() },
      { mcKeys: kit.keys as never, content: false }
    );
    const auth = { authorization: `Bearer ${await kit.sign()}` };
    return { ...t, list: () => t.app.inject({ method: 'GET', url: '/v1/admin/media?type=image', headers: auth }) };
  }

  it('is built once, on the first request, and shared', async () => {
    gcs.createGcsStore.mockResolvedValue(createMemoryMediaStore());
    const { list } = await withoutOverride();
    expect(gcs.createGcsStore).not.toHaveBeenCalled();

    await list();
    await list();

    expect(gcs.createGcsStore).toHaveBeenCalledTimes(1);
    expect(gcs.createGcsStore).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'media' }));
  });

  it('answers 502 while it cannot be built, then recovers without a restart', async () => {
    gcs.createGcsStore.mockRejectedValueOnce(new Error('bad credentials')).mockResolvedValue(createMemoryMediaStore());
    const { list } = await withoutOverride();

    expect((await list()).statusCode).toBe(502);
    expect((await list()).statusCode).toBe(200);
    expect(gcs.createGcsStore).toHaveBeenCalledTimes(2);
  });
});
