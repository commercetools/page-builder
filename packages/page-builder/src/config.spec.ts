import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEOUT_MS, readConfig, ShimConfigError } from './config.js';

const URL_ENV = { PB_SERVICE_URL: 'https://svc.example.com/service' };

describe('readConfig', () => {
  it('reads the environment and defaults the timeout', () => {
    expect(readConfig({}, { ...URL_ENV, PB_RENDER_KEY: 'k', PB_ORIGIN: 'https://shop.example.com' })).toEqual({
      serviceUrl: 'https://svc.example.com/service',
      renderKey: 'k',
      origin: 'https://shop.example.com',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  });

  it('lets props win over the environment and trims trailing slashes', () => {
    const c = readConfig(
      { serviceUrl: 'http://localhost:8080/service///', renderKey: 'prop', timeoutMs: 500 },
      { ...URL_ENV, PB_RENDER_KEY: 'env', PB_TIMEOUT_MS: '9000' }
    );
    expect(c).toMatchObject({ serviceUrl: 'http://localhost:8080/service', renderKey: 'prop', timeoutMs: 500 });
  });

  it('treats empty strings as unset', () => {
    const c = readConfig({}, { ...URL_ENV, PB_RENDER_KEY: '', PB_ORIGIN: '', PB_TIMEOUT_MS: '' });
    expect(c.renderKey).toBeUndefined();
    expect(c.origin).toBeUndefined();
    expect(c.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('parses the timeout from the environment', () => {
    expect(readConfig({}, { ...URL_ENV, PB_TIMEOUT_MS: '750' }).timeoutMs).toBe(750);
  });

  it.each([
    [{}, {}, 'PB_SERVICE_URL is not set'],
    [{}, { PB_SERVICE_URL: '   ' }, 'PB_SERVICE_URL is not set'],
    [{}, { PB_SERVICE_URL: 'ftp://x.example.com' }, 'is not an http(s) URL'],
    [{}, { PB_SERVICE_URL: 'not a url' }, 'is not an http(s) URL'],
    [{}, { ...URL_ENV, PB_TIMEOUT_MS: 'soon' }, 'must be a positive number'],
    [{}, { ...URL_ENV, PB_TIMEOUT_MS: '0' }, 'must be a positive number'],
    [{ timeoutMs: -5 }, URL_ENV, 'must be a positive number'],
  ])('rejects bad configuration %#', (overrides, env, message) => {
    expect(() => readConfig(overrides, env)).toThrow(ShimConfigError);
    expect(() => readConfig(overrides, env)).toThrow(message);
  });
});
