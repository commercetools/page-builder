import { useMediaUpload } from './use-media-upload';
import { act, renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import { createFakeMediaService } from '../../test-utils/media-service';
import { setServiceRequestForTests } from '../../service/transport';

installMockServer();

const ENVIRONMENT = { pageBuilderServiceUrl: 'https://service.test/service' };
const png = () => new File(['png'], 'hero.png', { type: 'image/png' });

const setup = (fake = createFakeMediaService()) => {
  setServiceRequestForTests(fake.request);
  return {
    fake,
    ...renderHookWithProviders(() => useMediaUpload(), {
      environment: ENVIRONMENT as never,
    }),
  };
};

describe('useMediaUpload', () => {
  it('stores the file and hands back where it went', async () => {
    const { fake, result } = setup();

    let stored;
    await act(async () => {
      stored = await result.current.upload(png());
    });

    expect(stored).toMatchObject({
      url: 'https://storage.test/stored/hero.png',
      name: 'hero.png',
    });
    expect(fake.calls).toEqual(['POST hero.png']);
    expect(result.current).toMatchObject({ uploading: false, error: null });
  });

  it('is busy while the upload is in flight', async () => {
    const fake = createFakeMediaService();
    const release = fake.holdUploads();
    const { result } = setup(fake);

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.upload(png());
    });
    await waitFor(() => expect(result.current.uploading).toBe(true));

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.uploading).toBe(false);
  });

  it('resolves null and keeps the refusal, rather than throwing', async () => {
    const fake = createFakeMediaService();
    fake.refuse({ status: 415, code: 'type_mismatch', message: 'nope' });
    const { result } = setup(fake);

    let stored: unknown = 'unset';
    await act(async () => {
      stored = await result.current.upload(png());
    });

    expect(stored).toBeNull();
    expect(result.current.error).toEqual({
      code: 'type_mismatch',
      message: 'nope',
    });

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('clears the last refusal when the next upload starts', async () => {
    const { fake, result } = setup();
    fake.refuse({ status: 502, code: 'storage_unavailable' });
    await act(async () => {
      await result.current.upload(png());
    });
    expect(result.current.error).not.toBeNull();

    fake.refuse(null);
    await act(async () => {
      await result.current.upload(png());
    });
    expect(result.current.error).toBeNull();
  });

  it('reports a network failure as one', async () => {
    setServiceRequestForTests(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { result } = renderHookWithProviders(() => useMediaUpload(), {
      environment: ENVIRONMENT as never,
    });

    await act(async () => {
      await result.current.upload(png());
    });

    expect(result.current.error).toEqual({
      code: 'network',
      message: 'Failed to fetch',
    });
  });

  it('does nothing without a service URL', async () => {
    const { result } = renderHookWithProviders(() => useMediaUpload(), {
      environment: {} as never,
    });
    let stored: unknown = 'unset';
    await act(async () => {
      stored = await result.current.upload(png());
    });
    expect(stored).toBeNull();
  });
});
