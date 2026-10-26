import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const CT = {
  CTP_PROJECT_KEY: 'us-store',
  CTP_CLIENT_ID: 'id',
  CTP_CLIENT_SECRET: 'secret',
  CTP_AUTH_URL: 'https://auth.europe-west1.gcp.commercetools.com/',
  CTP_API_URL: 'https://api.europe-west1.gcp.commercetools.com/',
};

const PROD = {
  NODE_ENV: 'production',
  ...CT,
  PB_RENDER_KEY: 'k',
  PB_RENDER_ORIGINS: 'https://shop.example.com',
  PB_ADMIN_SECRET: 's',
};

function problems(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  return [];
}

describe('loadConfig', () => {
  it('derives CT URLs from CTP_REGION and accepts CTP_SCOPE', () => {
    const c = loadConfig({
      CTP_PROJECT_KEY: 'us-store',
      CTP_CLIENT_ID: 'id',
      CTP_CLIENT_SECRET: 'secret',
      CTP_REGION: 'us-central1.gcp',
      CTP_SCOPE: 'manage_key_value_documents:us-store view_products:us-store',
    });
    expect(c.ct).toMatchObject({
      authUrl: 'https://auth.us-central1.gcp.commercetools.com',
      apiUrl: 'https://api.us-central1.gcp.commercetools.com',
      scopes: 'manage_key_value_documents:us-store view_products:us-store',
    });
  });

  it('prefers explicit URLs and CTP_SCOPES over the Connect aliases', () => {
    const c = loadConfig({ ...CT, CTP_REGION: 'x', CTP_SCOPE: 'a', CTP_SCOPES: 'b' });
    expect(c.ct?.authUrl).toBe('https://auth.europe-west1.gcp.commercetools.com');
    expect(c.ct?.scopes).toBe('b');
  });

  it('always mounts under the Connect endpoint and has no setting for it', () => {
    expect(loadConfig({}).basePath).toBe('/service');
    expect(loadConfig({ PB_BASE_PATH: '/elsewhere' }).basePath).toBe('/service');
  });

  it('parses facet settings', () => {
    const c = loadConfig({ PB_FACET_ATTRIBUTES: ' color , size ', PB_FACET_LIMIT: '3' });
    expect(c.facetAttributes).toEqual(['color', 'size']);
    expect(c.facetLimit).toBe(3);
    expect(problems({ PB_FACET_LIMIT: '-1' })).toEqual(['PB_FACET_LIMIT: "-1" must be an integer >= 0']);
  });

  it('applies defaults in local development with nothing configured', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      production: false,
      port: 8080,
      basePath: '/service',
      logLevel: 'info',
      ct: null,
      previewToken: undefined,
      renderKey: undefined,
      renderOrigins: [],
      editorOrigins: [],
      adminSecret: undefined,
      mc: null,
      cacheTtlSeconds: 15,
      facetAttributes: [],
      facetLimit: 8,
    });
  });

  it('builds CT config, trimming URL slashes and defaulting scopes', () => {
    const c = loadConfig(CT);
    expect(c.ct).toEqual({
      projectKey: 'us-store',
      clientId: 'id',
      clientSecret: 'secret',
      authUrl: 'https://auth.europe-west1.gcp.commercetools.com',
      apiUrl: 'https://api.europe-west1.gcp.commercetools.com',
      scopes:
        'manage_key_value_documents:us-store view_products:us-store view_categories:us-store view_stores:us-store',
    });
  });

  it('honours explicit CT scopes', () => {
    expect(loadConfig({ ...CT, CTP_SCOPES: 'a b' }).ct?.scopes).toBe('a b');
  });

  it('rejects partially set CT credentials even in development', () => {
    expect(problems({ CTP_PROJECT_KEY: 'x' })).toEqual([
      expect.stringContaining('missing: CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_AUTH_URL, CTP_API_URL'),
    ]);
  });

  it('accepts a complete production configuration', () => {
    const c = loadConfig(PROD);
    expect(c.production).toBe(true);
    expect(c.renderOrigins).toEqual(['https://shop.example.com']);
  });

  it('lists every missing production setting in one error', () => {
    expect(problems({ NODE_ENV: 'production' })).toEqual([
      expect.stringContaining('commercetools credentials incomplete'),
      'PB_RENDER_KEY is required in production',
      'PB_RENDER_ORIGINS is required in production',
      'PB_ADMIN_SECRET is required in production',
    ]);
  });

  it('does not require the render key or allowlist outside production', () => {
    expect(problems({ ...CT })).toEqual([]);
  });

  it('normalises origins and parses comma-separated lists', () => {
    const c = loadConfig({
      PB_RENDER_ORIGINS: ' https://a.example.com/path , http://localhost:3000 ',
      PB_EDITOR_ORIGINS: 'https://mc.europe-west1.gcp.commercetools.com',
    });
    expect(c.renderOrigins).toEqual(['https://a.example.com', 'http://localhost:3000']);
    expect(c.editorOrigins).toEqual(['https://mc.europe-west1.gcp.commercetools.com']);
  });

  it('rejects malformed and non-http origins', () => {
    expect(problems({ PB_RENDER_ORIGINS: 'not a url,ftp://x.example.com' })).toEqual([
      'PB_RENDER_ORIGINS: "not a url" is not an http(s) origin',
      'PB_RENDER_ORIGINS: "ftp://x.example.com" is not an http(s) origin',
    ]);
  });

  it('validates port, cache TTL and log level', () => {
    expect(problems({ PORT: '99999', PB_CACHE_TTL_SECONDS: '-1', LOG_LEVEL: 'loud' })).toEqual([
      'PORT: "99999" is not a valid port',
      'PB_CACHE_TTL_SECONDS: "-1" must be a number >= 0',
      'LOG_LEVEL: "loud" must be one of debug, info, warn, error, silent',
    ]);
  });

  it('allows a zero TTL to disable the cache', () => {
    expect(loadConfig({ PB_CACHE_TTL_SECONDS: '0' }).cacheTtlSeconds).toBe(0);
  });

  it('treats empty strings as unset secrets', () => {
    const c = loadConfig({ PB_PREVIEW_TOKEN: '', PB_RENDER_KEY: '', PB_ADMIN_SECRET: '' });
    expect(c.previewToken).toBeUndefined();
    expect(c.renderKey).toBeUndefined();
    expect(c.adminSecret).toBeUndefined();
  });

  describe('merchant center admin auth', () => {
    it('is disabled unless configured', () => {
      expect(loadConfig({}).mc).toBeNull();
    });

    it('maps a cloud identifier to the gateway URL and normalises the audience to an origin', () => {
      expect(loadConfig({ PB_MC_ISSUER: 'gcp-eu', CONNECT_DEPLOYED_URL: 'https://svc.example.com/service' }).mc).toEqual({
        issuer: 'https://mc-api.europe-west1.gcp.commercetools.com',
        audience: 'https://svc.example.com',
      });
    });

    it('accepts an issuer URL', () => {
      expect(loadConfig({ PB_MC_ISSUER: 'https://mc-api.test/', CONNECT_DEPLOYED_URL: 'https://svc.test' }).mc?.issuer).toBe('https://mc-api.test');
    });

    it('is not enabled by the deployed URL alone, which Connect always provides', () => {
      expect(loadConfig({ CONNECT_DEPLOYED_URL: 'https://svc.test' }).mc).toBeNull();
    });

    it('needs the deployed URL when an issuer is set, and valid values', () => {
      expect(() => loadConfig({ PB_MC_ISSUER: 'gcp-eu' })).toThrow('PB_MC_ISSUER requires CONNECT_DEPLOYED_URL');
      expect(() => loadConfig({ PB_MC_ISSUER: 'nowhere', CONNECT_DEPLOYED_URL: 'https://svc.test' })).toThrow('neither a cloud identifier nor a URL');
      expect(() => loadConfig({ PB_MC_ISSUER: 'gcp-eu', CONNECT_DEPLOYED_URL: 'ftp://x' })).toThrow('CONNECT_DEPLOYED_URL');
    });

    it('has no PB_MC_AUDIENCE setting', () => {
      expect(loadConfig({ PB_MC_ISSUER: 'gcp-eu', CONNECT_DEPLOYED_URL: 'https://svc.test', PB_MC_AUDIENCE: 'https://other.test' }).mc?.audience).toBe('https://svc.test');
    });
  });
});

describe('.env.example', () => {
  const parse = (text: string): Record<string, string> =>
    Object.fromEntries(
      text
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    );
  const example = parse(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));

  it('loads once the credentials are filled in', () => {
    const config = loadConfig({
      ...example,
      CTP_PROJECT_KEY: 'us-store',
      CTP_CLIENT_ID: 'id',
      CTP_CLIENT_SECRET: 'secret',
    });
    expect(config.basePath).toBe('/service');
    expect(config.ct?.apiUrl).toBe('https://api.europe-west1.gcp.commercetools.com');
  });

  it('is rejected as incomplete while the credentials are blank', () => {
    expect(problems(example)[0]).toMatch(/credentials incomplete/);
  });

  it('meets the production requirements once secrets are supplied', () => {
    expect(
      problems({
        ...example,
        NODE_ENV: 'production',
        CTP_PROJECT_KEY: 'p',
        CTP_CLIENT_ID: 'i',
        CTP_CLIENT_SECRET: 's',
        PB_RENDER_KEY: 'k',
        PB_ADMIN_SECRET: 'a',
      })
    ).toEqual([]);
  });
});
