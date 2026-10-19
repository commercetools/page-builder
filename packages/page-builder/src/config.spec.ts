import { describe, expect, it } from 'vitest';
import { getPageBuilderConfig } from './config.js';

const ctEnv = {
  CTP_PROJECT_KEY: 'test-project',
  CTP_CLIENT_ID: 'client-id',
  CTP_CLIENT_SECRET: 'client-secret',
  CTP_AUTH_URL: 'https://auth.example.test',
  CTP_API_URL: 'https://api.example.test',
};

describe('allowedOrigins', () => {
  it('is empty when unset', () => {
    expect(getPageBuilderConfig({}).allowedOrigins).toEqual([]);
  });

  it('splits and trims a comma-separated list', () => {
    expect(
      getPageBuilderConfig({ PB_ALLOWED_ORIGINS: 'https://a.test, https://b.test' })
        .allowedOrigins
    ).toEqual(['https://a.test', 'https://b.test']);
  });

  it('drops empty entries', () => {
    expect(
      getPageBuilderConfig({ PB_ALLOWED_ORIGINS: ',https://a.test,,  ,' })
        .allowedOrigins
    ).toEqual(['https://a.test']);
  });
});

describe('previewToken', () => {
  it('is undefined when unset, which disables preview entirely', () => {
    expect(getPageBuilderConfig({}).previewToken).toBeUndefined();
  });

  it('is read verbatim', () => {
    expect(getPageBuilderConfig({ PB_PREVIEW_TOKEN: ' spaced ' }).previewToken).toBe(
      ' spaced '
    );
  });
});

describe('dynamicPages', () => {
  it('is off unless the value is exactly "true"', () => {
    expect(getPageBuilderConfig({}).dynamicPages).toBe(false);
    expect(getPageBuilderConfig({ DYNAMIC_PAGES: 'TRUE' }).dynamicPages).toBe(false);
    expect(getPageBuilderConfig({ DYNAMIC_PAGES: '1' }).dynamicPages).toBe(false);
  });

  it('is on for "true"', () => {
    expect(getPageBuilderConfig({ DYNAMIC_PAGES: 'true' }).dynamicPages).toBe(true);
  });
});

describe('ct credentials', () => {
  it('is null when none are set', () => {
    expect(getPageBuilderConfig({}).ct).toBeNull();
  });

  it('is null when any single one is missing', () => {
    for (const key of Object.keys(ctEnv)) {
      const partial = { ...ctEnv, [key]: undefined };
      expect(getPageBuilderConfig(partial).ct).toBeNull();
    }
  });

  it('is null when a value is present but empty', () => {
    expect(getPageBuilderConfig({ ...ctEnv, CTP_CLIENT_SECRET: '' }).ct).toBeNull();
  });

  it('collects all five when they are present', () => {
    expect(getPageBuilderConfig(ctEnv).ct).toMatchObject({
      projectKey: 'test-project',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
  });

  it('strips a trailing slash from the auth and API URLs', () => {
    const ct = getPageBuilderConfig({
      ...ctEnv,
      CTP_AUTH_URL: 'https://auth.example.test/',
      CTP_API_URL: 'https://api.example.test/',
    }).ct;
    expect(ct?.authUrl).toBe('https://auth.example.test');
    expect(ct?.apiUrl).toBe('https://api.example.test');
  });

  it('defaults to the minimal project-scoped write scope', () => {
    expect(getPageBuilderConfig(ctEnv).ct?.scopes).toBe(
      'manage_key_value_documents:test-project'
    );
  });

  it('honours an explicit scope list', () => {
    expect(
      getPageBuilderConfig({ ...ctEnv, CTP_SCOPES: 'view_products:x' }).ct?.scopes
    ).toBe('view_products:x');
  });

  it('falls back to the default for an empty scope string', () => {
    expect(getPageBuilderConfig({ ...ctEnv, CTP_SCOPES: '' }).ct?.scopes).toBe(
      'manage_key_value_documents:test-project'
    );
  });
});

describe('reading from process.env', () => {
  it('defaults to the real environment', () => {
    // Only that it reads something without throwing — the shape is covered above.
    expect(getPageBuilderConfig()).toMatchObject({
      allowedOrigins: expect.any(Array),
      dynamicPages: expect.any(Boolean),
    });
  });
});
