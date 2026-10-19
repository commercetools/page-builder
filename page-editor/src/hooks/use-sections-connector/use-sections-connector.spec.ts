import { useSectionsPublishedFetcher } from './use-sections-connector';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { buildSection } from '../../test-utils/factories';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const seedSections = (value: unknown) =>
  store.seed({ container: 'page-editor', key: 'sections', value });

describe('useSectionsPublishedFetcher', () => {
  it('returns the published payload and the CT version', async () => {
    const published = {
      schemaVersion: 2,
      appVersion: 4,
      publishedAt: '2026-01-15T10:00:00.000Z',
      sections: [buildSection({ id: 'HEAD' })],
    };
    seedSections({ schemaVersion: 2, draft: {}, published });

    const { result } = renderHookWithProviders(() =>
      useSectionsPublishedFetcher()
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toEqual(published);
    expect(result.current.ctVersion).toBe(1);
    expect(result.current.error).toBeUndefined();
  });

  it('reports a null payload when the object has never been published', async () => {
    seedSections({ schemaVersion: 2, draft: {}, published: null });

    const { result } = renderHookWithProviders(() =>
      useSectionsPublishedFetcher()
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
    expect(result.current.ctVersion).toBe(1);
  });

  it('reports a null payload when the object does not exist at all', async () => {
    const { result } = renderHookWithProviders(() =>
      useSectionsPublishedFetcher()
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
    expect(result.current.ctVersion).toBeNull();
  });

  it('surfaces a GraphQL error instead of pretending there is no data', async () => {
    server.use(failOperation('FetchSections', 'boom'));

    const { result } = renderHookWithProviders(() =>
      useSectionsPublishedFetcher()
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toContain('boom');
    expect(result.current.payload).toBeNull();
  });
});
