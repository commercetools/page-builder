import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_UPLOAD_BYTES, DEFAULT_PATH_PREFIX, MAX_UPLOAD_CEILING, loadMediaConfig } from './config.js';

const key = (over: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify({ client_email: 'svc@p.iam.gserviceaccount.com', private_key: 'PEM', project_id: 'p', ...over })).toString('base64');

const load = (env: Record<string, string | undefined>) => {
  const problems: string[] = [];
  const config = loadMediaConfig(env, problems);
  return { config, problems };
};

describe('loadMediaConfig', () => {
  it('is off when neither the bucket nor the key is set', () => {
    expect(load({})).toEqual({ config: null, problems: [] });
    expect(load({ PB_MEDIA_BUCKET: '  ', PB_MEDIA_SERVICE_ACCOUNT_KEY_B64: '' })).toEqual({ config: null, problems: [] });
  });

  it('applies the defaults once a bucket and key are set', () => {
    const { config, problems } = load({ PB_MEDIA_BUCKET: 'media', PB_MEDIA_SERVICE_ACCOUNT_KEY_B64: key() });
    expect(problems).toEqual([]);
    expect(config).toMatchObject({
      bucket: 'media',
      pathPrefix: DEFAULT_PATH_PREFIX,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
      serviceAccount: { client_email: 'svc@p.iam.gserviceaccount.com', private_key: 'PEM', project_id: 'p' },
    });
    expect([...config!.allowedMimeTypes]).toContain('image/png');
    expect(config!.allowedMimeTypes.has('image/svg+xml')).toBe(false);
  });

  it('accepts a key without a project id', () => {
    const { config } = load({ PB_MEDIA_BUCKET: 'media', PB_MEDIA_SERVICE_ACCOUNT_KEY_B64: key({ project_id: undefined }) });
    expect(config?.serviceAccount).not.toHaveProperty('project_id');
  });

  it('reads the optional settings', () => {
    const { config, problems } = load({
      PB_MEDIA_BUCKET: 'media',
      PB_MEDIA_SERVICE_ACCOUNT_KEY_B64: key(),
      PB_MEDIA_PATH_PREFIX: '/site/uploads/',
      PB_MEDIA_MAX_BYTES: '2048',
      PB_MEDIA_ALLOWED_TYPES: 'Image/PNG, image/webp',
    });
    expect(problems).toEqual([]);
    expect(config).toMatchObject({ pathPrefix: 'site/uploads', maxUploadBytes: 2048 });
    expect([...config!.allowedMimeTypes]).toEqual(['image/png', 'image/webp']);
  });

  it.each([
    [{ PB_MEDIA_BUCKET: 'media' }, 'must be set together'],
    [{ PB_MEDIA_SERVICE_ACCOUNT_KEY_B64: 'x' }, 'must be set together'],
  ])('reports a half-set pair (%j)', (env, message) => {
    const { config, problems } = load(env);
    expect(config).toBeNull();
    expect(problems.join()).toContain(message);
  });

  it.each([
    ['not base64 JSON', 'not-json'],
    ['a JSON array', Buffer.from('[]').toString('base64')],
    ['JSON without a private key', Buffer.from('{"client_email":"a"}').toString('base64')],
    ['a JSON scalar', Buffer.from('7').toString('base64')],
  ])('rejects a key that is %s, without echoing it', (_label, value) => {
    const { config, problems } = load({ PB_MEDIA_BUCKET: 'media', PB_MEDIA_SERVICE_ACCOUNT_KEY_B64: value });
    expect(config).toBeNull();
    expect(problems.join()).toContain('PB_MEDIA_SERVICE_ACCOUNT_KEY_B64 is not base64');
    expect(problems.join()).not.toContain(value);
  });

  it.each([
    ['PB_MEDIA_PATH_PREFIX', 'has space'],
    ['PB_MEDIA_PATH_PREFIX', 'a//b'],
    ['PB_MEDIA_PATH_PREFIX', '///'],
    ['PB_MEDIA_MAX_BYTES', '10'],
    ['PB_MEDIA_MAX_BYTES', String(MAX_UPLOAD_CEILING + 1)],
    ['PB_MEDIA_MAX_BYTES', 'lots'],
    ['PB_MEDIA_ALLOWED_TYPES', 'image/svg+xml'],
    ['PB_MEDIA_ALLOWED_TYPES', ' , '],
  ])('rejects %s=%j', (name, value) => {
    const { problems } = load({ PB_MEDIA_BUCKET: 'media', PB_MEDIA_SERVICE_ACCOUNT_KEY_B64: key(), [name]: value });
    expect(problems.join()).toContain(name);
  });
});
