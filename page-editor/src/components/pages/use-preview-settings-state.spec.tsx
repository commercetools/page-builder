import { usePreviewSettingsState } from './use-preview-settings-state';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import { buildPreviewSettings } from '../../test-utils/factories';

const store = installMockServer();
const CONTAINER = 'page-editor';
const KEY = 'settings';

const seed = (preview: unknown) =>
  store.seed({
    container: CONTAINER,
    key: KEY,
    value: { schemaVersion: 2, preview },
  })[0];

const stored = () =>
  (store.get(CONTAINER, KEY)?.value as { preview: { baseUrl: string } })
    ?.preview;

describe('usePreviewSettingsState', () => {
  it('shows the saved settings straight after a save', async () => {
    seed(buildPreviewSettings({ baseUrl: 'https://old.test' }));
    const { result } = renderHookWithProviders(() => usePreviewSettingsState());
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    const next = buildPreviewSettings({ baseUrl: 'https://new.test' });
    await act(async () => {
      await result.current.save(next);
    });

    expect(stored()?.baseUrl).toBe('https://new.test');
    await waitFor(() =>
      expect(result.current.settings?.baseUrl).toBe('https://new.test')
    );
  });

  it('still shows the saved settings when the dashboard is left and re-entered', async () => {
    seed(buildPreviewSettings({ baseUrl: 'https://old.test' }));
    const first = renderHookWithProviders(() => usePreviewSettingsState());
    await waitFor(() => expect(first.result.current.settings).not.toBeNull());

    await act(async () => {
      await first.result.current.save(
        buildPreviewSettings({ baseUrl: 'https://new.test' })
      );
    });
    first.unmount();

    // Same Apollo client / cache is NOT shared by renderHookWithProviders, so
    // this re-reads from the store: the persisted value must be the new one.
    const second = renderHookWithProviders(() => usePreviewSettingsState());
    await waitFor(() => expect(second.result.current.settings).not.toBeNull());
    expect(second.result.current.settings?.baseUrl).toBe('https://new.test');
  });

  it('saves twice in a row without a stale-version failure', async () => {
    seed(buildPreviewSettings({ baseUrl: 'https://one.test' }));
    const { result } = renderHookWithProviders(() => usePreviewSettingsState());
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.save(
        buildPreviewSettings({ baseUrl: 'https://two.test' })
      );
    });
    await act(async () => {
      await result.current.save(
        buildPreviewSettings({ baseUrl: 'https://three.test' })
      );
    });

    expect(stored()?.baseUrl).toBe('https://three.test');
    await waitFor(() =>
      expect(result.current.settings?.baseUrl).toBe('https://three.test')
    );
  });
});
