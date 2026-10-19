import {
  PREVIEW_ENVS,
  resolveActiveEnv,
  useActivePreviewEnv,
  useLocalPreviewUrl,
} from './use-preview-environment';
import { act, renderHookWithProviders } from '../../../test-utils/render';
import { buildPreviewSettings } from '../../../test-utils/factories';

const ENV_KEY = 'pb:preview:env';
const LOCAL_URL_KEY = 'pb:preview:local';

beforeEach(() => {
  window.localStorage.clear();
});

describe('PREVIEW_ENVS', () => {
  it('offers production, staging and local', () => {
    expect(PREVIEW_ENVS).toEqual(['production', 'staging', 'local']);
  });
});

describe('useActivePreviewEnv', () => {
  it('defaults to production', () => {
    const { result } = renderHookWithProviders(() => useActivePreviewEnv());
    expect(result.current[0]).toBe('production');
  });

  it('restores a previously chosen environment', () => {
    window.localStorage.setItem(ENV_KEY, 'staging');
    const { result } = renderHookWithProviders(() => useActivePreviewEnv());
    expect(result.current[0]).toBe('staging');
  });

  it('falls back to production for a value it does not recognise', () => {
    window.localStorage.setItem(ENV_KEY, 'nonsense');
    const { result } = renderHookWithProviders(() => useActivePreviewEnv());
    expect(result.current[0]).toBe('production');
  });

  it('persists the choice per browser', () => {
    const { result } = renderHookWithProviders(() => useActivePreviewEnv());
    act(() => result.current[1]('local'));

    expect(result.current[0]).toBe('local');
    expect(window.localStorage.getItem(ENV_KEY)).toBe('local');
  });
});

describe('useLocalPreviewUrl', () => {
  it('starts empty', () => {
    const { result } = renderHookWithProviders(() => useLocalPreviewUrl());
    expect(result.current[0]).toEqual({ baseUrl: '' });
  });

  it('restores a stored local URL and token', () => {
    window.localStorage.setItem(
      LOCAL_URL_KEY,
      JSON.stringify({ baseUrl: 'http://localhost:3000', token: 'dev' })
    );
    const { result } = renderHookWithProviders(() => useLocalPreviewUrl());
    expect(result.current[0]).toEqual({
      baseUrl: 'http://localhost:3000',
      token: 'dev',
    });
  });

  it('normalizes an empty token to undefined', () => {
    window.localStorage.setItem(
      LOCAL_URL_KEY,
      JSON.stringify({ baseUrl: 'http://localhost:3000', token: '' })
    );
    const { result } = renderHookWithProviders(() => useLocalPreviewUrl());
    expect(result.current[0].token).toBeUndefined();
  });

  it('recovers from corrupt stored JSON', () => {
    window.localStorage.setItem(LOCAL_URL_KEY, '{not json');
    const { result } = renderHookWithProviders(() => useLocalPreviewUrl());
    expect(result.current[0]).toEqual({ baseUrl: '' });
  });

  it('persists a new local URL, never to the shared project', () => {
    const { result } = renderHookWithProviders(() => useLocalPreviewUrl());
    act(() => result.current[1]({ baseUrl: 'http://localhost:4000' }));

    expect(result.current[0].baseUrl).toBe('http://localhost:4000');
    expect(JSON.parse(window.localStorage.getItem(LOCAL_URL_KEY)!)).toEqual({
      baseUrl: 'http://localhost:4000',
    });
  });
});

describe('resolveActiveEnv', () => {
  const localUrl = { baseUrl: 'http://localhost:3000', token: 'dev' };

  it('uses the browser-local URL for the local environment', () => {
    expect(resolveActiveEnv(buildPreviewSettings(), localUrl, 'local')).toBe(
      localUrl
    );
  });

  it('uses the configured environment URL when one is set', () => {
    const settings = buildPreviewSettings({
      environments: {
        production: { baseUrl: 'https://shop.test', token: 'prod' },
        staging: { baseUrl: 'https://staging.test', token: 'stg' },
      },
    });
    expect(resolveActiveEnv(settings, localUrl, 'staging')).toEqual({
      baseUrl: 'https://staging.test',
      token: 'stg',
    });
  });

  it('falls back to the legacy single base URL when the environment is blank', () => {
    const settings = buildPreviewSettings({
      baseUrl: 'https://legacy.test',
      token: 'legacy',
      environments: {
        production: { baseUrl: '', token: undefined },
        staging: { baseUrl: '', token: undefined },
      },
    });
    expect(resolveActiveEnv(settings, localUrl, 'production')).toEqual({
      baseUrl: 'https://legacy.test',
      token: 'legacy',
    });
  });

  it('falls back when there are no environments at all', () => {
    expect(
      resolveActiveEnv(
        { baseUrl: 'https://legacy.test', token: 't' },
        localUrl,
        'production'
      )
    ).toEqual({ baseUrl: 'https://legacy.test', token: 't' });
  });

  it('reports an empty base URL when nothing is configured', () => {
    expect(resolveActiveEnv(null, localUrl, 'production')).toEqual({
      baseUrl: '',
      token: undefined,
    });
  });

  it('still returns the local URL even with no settings', () => {
    expect(resolveActiveEnv(undefined, localUrl, 'local')).toBe(localUrl);
  });
});
