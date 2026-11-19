import { useMediaLibrary } from './use-media-library';
import { act, renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import { createFakeMediaService } from '../../test-utils/media-service';
import { setServiceRequestForTests } from '../../service/transport';

installMockServer();

const ENVIRONMENT = { pageBuilderServiceUrl: 'https://service.test/service' };

const names = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `img-${i + 1}.png` }));

function setup(
  fake = createFakeMediaService(names(5), { pageSize: 2 }),
  initial: { kind?: 'image' | 'video'; enabled?: boolean } = {}
) {
  setServiceRequestForTests(fake.request);
  const rendered = renderHookWithProviders(
    (props: { kind: 'image' | 'video'; enabled: boolean }) =>
      useMediaLibrary(props.kind, props.enabled),
    {
      environment: ENVIRONMENT as never,
      initialProps: { kind: 'image', enabled: true, ...initial },
    }
  );
  return { fake, ...rendered };
}

describe('useMediaLibrary', () => {
  it('fetches nothing until it is enabled', async () => {
    const { fake, result, rerender } = setup(undefined, { enabled: false });
    expect(result.current).toMatchObject({ files: [], loading: false });
    expect(fake.calls).toEqual([]);

    rerender({ kind: 'image', enabled: true });
    await waitFor(() => expect(result.current.files).toHaveLength(2));
    expect(fake.calls).toEqual(['GET image']);
  });

  it('loads the first page, then appends the next on request', async () => {
    const { result } = setup();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.files.map((f) => f.name)).toEqual([
      'img-1.png',
      'img-2.png',
    ]);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.files).toHaveLength(4));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.files).toHaveLength(5));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.files.map((f) => f.name)).toEqual(
      names(5).map((f) => f.name)
    );
  });

  it('ignores loadMore on the last page', async () => {
    const { fake, result } = setup(createFakeMediaService(names(1)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.loadMore());
    expect(fake.calls).toEqual(['GET image']);
  });

  it('starts over for another kind', async () => {
    const fake = createFakeMediaService([
      { name: 'a.png' },
      { name: 'clip.mp4', kind: 'video' },
    ]);
    const { result, rerender } = setup(fake);
    await waitFor(() =>
      expect(result.current.files.map((f) => f.name)).toEqual(['a.png'])
    );

    rerender({ kind: 'video', enabled: true });
    await waitFor(() =>
      expect(result.current.files.map((f) => f.name)).toEqual(['clip.mp4'])
    );
  });

  it('clears when it is closed, so the next opening does not flash the last one', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.files).toHaveLength(2));
    rerender({ kind: 'image', enabled: false });
    await waitFor(() => expect(result.current.files).toEqual([]));
  });

  it('reports a service without a bucket as not configured, not as an error', async () => {
    const fake = createFakeMediaService();
    fake.refuse({ status: 501, code: 'media_not_configured' });
    const { result } = setup(fake);
    await waitFor(() => expect(result.current.notConfigured).toBe(true));
    expect(result.current).toMatchObject({
      error: null,
      loading: false,
      files: [],
    });
  });

  it('reports any other refusal, keeping the files already loaded', async () => {
    const { fake, result } = setup();
    await waitFor(() => expect(result.current.files).toHaveLength(2));

    fake.refuse({ status: 502, code: 'storage_unavailable', message: 'down' });
    act(() => result.current.loadMore());

    await waitFor(() =>
      expect(result.current.error).toEqual({
        code: 'storage_unavailable',
        message: 'down',
      })
    );
    expect(result.current.files).toHaveLength(2);
    expect(result.current.notConfigured).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it('does nothing without a service URL', () => {
    const { result } = renderHookWithProviders(
      () => useMediaLibrary('image', true),
      {
        environment: {} as never,
      }
    );
    expect(result.current).toMatchObject({
      files: [],
      loading: false,
      notConfigured: false,
    });
  });
});
