import { useState } from 'react';
import {
  DEFAULT_PREVIEW_SETTINGS,
  usePreviewSettingsFetcher,
  usePreviewSettingsUpdater,
} from './use-preview-settings-connector';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { buildPreviewSettings } from '../../test-utils/factories';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();
const CONTAINER = 'page-editor';
const KEY = 'settings';

const seed = (preview: unknown, schemaVersion = 2) =>
  store.seed({
    container: CONTAINER,
    key: KEY,
    value: { schemaVersion, preview },
  })[0];

const stored = () =>
  store.get(CONTAINER, KEY)?.value as
    | { schemaVersion: number; preview: Record<string, unknown> }
    | undefined;

describe('DEFAULT_PREVIEW_SETTINGS', () => {
  it('is disabled with no host configured, so preview stays off until set up', () => {
    expect(DEFAULT_PREVIEW_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_PREVIEW_SETTINGS.baseUrl).toBe('');
  });

  it('ships a template for every page type', () => {
    expect(Object.keys(DEFAULT_PREVIEW_SETTINGS.routes).sort()).toEqual([
      'category',
      'content',
      'home',
      'pdp',
    ]);
  });
});

describe('usePreviewSettingsFetcher', () => {
  it('reports null when nothing has been configured', async () => {
    const { result } = renderHookWithProviders(() =>
      usePreviewSettingsFetcher()
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toBeNull();
    expect(result.current.ctVersion).toBeNull();
  });

  it('reads the stored settings and CT version', async () => {
    const settings = buildPreviewSettings({ baseUrl: 'https://shop.test' });
    seed(settings);

    const { result } = renderHookWithProviders(() =>
      usePreviewSettingsFetcher()
    );
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.settings?.baseUrl).toBe('https://shop.test');
    expect(result.current.ctVersion).toBe(1);
  });

  it('synthesizes environments for pre-v2 settings that lack them', async () => {
    seed(
      {
        enabled: true,
        baseUrl: 'https://legacy.test',
        token: 'legacy-token',
        defaultLocale: 'en-us',
        locales: ['en-us'],
        routes: DEFAULT_PREVIEW_SETTINGS.routes,
      },
      1
    );

    const { result } = renderHookWithProviders(() =>
      usePreviewSettingsFetcher()
    );
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    expect(result.current.settings?.environments?.production).toEqual({
      baseUrl: 'https://legacy.test',
      token: 'legacy-token',
    });
    expect(result.current.settings?.environments?.staging).toEqual({
      baseUrl: '',
      token: undefined,
    });
  });

  it('leaves already-migrated settings untouched', async () => {
    const settings = buildPreviewSettings();
    seed(settings);

    const { result } = renderHookWithProviders(() =>
      usePreviewSettingsFetcher()
    );
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.settings?.environments).toEqual(
      settings.environments
    );
  });

  it('keeps a stable identity across renders, so consumer effects do not loop', async () => {
    // The legacy path builds a new object; without memoization every render
    // would produce a fresh `settings` and re-fire effects keyed on it.
    seed(
      {
        enabled: true,
        baseUrl: 'https://legacy.test',
        defaultLocale: 'en-us',
        locales: ['en-us'],
        routes: DEFAULT_PREVIEW_SETTINGS.routes,
      },
      1
    );

    const seen: unknown[] = [];
    let forceRender!: () => void;
    const { result } = renderHookWithProviders(() => {
      const [, setTick] = useState(0);
      forceRender = () => setTick((n) => n + 1);
      const value = usePreviewSettingsFetcher();
      seen.push(value.settings);
      return value;
    });
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    // Re-render in place with the Apollo cache unchanged. Without the memo,
    // `withEnvironments` would mint a fresh object here and re-fire every
    // consumer effect keyed on `settings`.
    // `forceRender` is the test component's own setState, not a Testing Library
    // helper, so React genuinely does need it wrapped.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    act(() => forceRender());

    const settled = seen.filter(Boolean);
    expect(settled.length).toBeGreaterThan(1);
    expect(new Set(settled).size).toBe(1);
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchPreviewSettings', 'nope'));

    const { result } = renderHookWithProviders(() =>
      usePreviewSettingsFetcher()
    );
    await waitFor(() => expect(result.current.error).toBeDefined());
  });
});

describe('usePreviewSettingsUpdater', () => {
  const updater = () =>
    renderHookWithProviders(() => usePreviewSettingsUpdater()).result;

  it('writes the settings wrapped in the schema envelope', async () => {
    const settings = buildPreviewSettings({ baseUrl: 'https://shop.test' });
    const result = updater();
    await act(async () => {
      await result.current.saveSettings(settings, null);
    });

    expect(stored()!.schemaVersion).toEqual(expect.any(Number));
    expect(stored()!.preview).toEqual(settings);
  });

  it('returns the new CT version', async () => {
    const result = updater();
    let out!: { ctVersion: number | null };
    await act(async () => {
      out = await result.current.saveSettings(buildPreviewSettings(), null);
    });
    expect(out.ctVersion).toBe(1);
  });

  it('rejects a save that loses a version race', async () => {
    seed(buildPreviewSettings());
    const result = updater();
    await act(async () => {
      await expect(
        result.current.saveSettings(buildPreviewSettings(), 99)
      ).rejects.toBeDefined();
    });
  });

  it('surfaces a write failure', async () => {
    server.use(failOperation('UpsertPreviewSettings', 'nope', 'mutation'));
    const result = updater();
    await act(async () => {
      await expect(
        result.current.saveSettings(buildPreviewSettings(), null)
      ).rejects.toBeDefined();
    });
  });
});
