import { ImagePickerHost, useImagePickerStatus } from './image-picker-host';
import { renderHookWithProviders, waitFor } from '../../../test-utils/render';
import { installMockServer, respondWith } from '../../../test-utils/msw';
import { server } from '../../../test-utils/msw/server';

const store = installMockServer();

const CONTAINER = 'contentools-configuration';
const KEY = 'contentools-jwt-token';
const BASE_URL = 'https://media.example.test';

const jwt = (secondsFromNow: number) =>
  `header.${btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })
  )}.signature`;

const seedToken = (token: string) =>
  store.seed({ container: CONTAINER, key: KEY, value: token });

const noToken = () =>
  server.use(respondWith('FetchImagePickerToken', { customObject: null }));

const render = (
  environment: Record<string, unknown> = {},
  project: Record<string, unknown> = { key: 'test-project' }
) =>
  renderHookWithProviders(() => useImagePickerStatus(), {
    environment: environment as never,
    project: project as never,
    wrapper: ({ children }: { children?: React.ReactNode }) => (
      <ImagePickerHost>{children}</ImagePickerHost>
    ),
  });

describe('ImagePickerHost when unconfigured', () => {
  it('reports itself unconfigured with no base URL', async () => {
    const { result } = render({});
    await waitFor(() => expect(result.current.configured).toBe(false));
    expect(result.current.hasToken).toBe(false);
  });

  it('reports itself unconfigured without a project key', async () => {
    const { result } = render(
      { imagePickerBaseUrl: BASE_URL },
      { key: undefined }
    );
    await waitFor(() => expect(result.current.configured).toBe(false));
  });

  it('still renders its children, so media fields degrade to a note', async () => {
    const { result } = render({});
    // The status context is available even without a provider above it.
    await waitFor(() => expect(result.current).toBeDefined());
  });
});

describe('ImagePickerHost when configured', () => {
  it('reports itself configured', async () => {
    noToken();
    const { result } = render({ imagePickerBaseUrl: BASE_URL });
    await waitFor(() => expect(result.current.configured).toBe(true));
  });

  it('reports no token when the custom object is absent', async () => {
    noToken();
    const { result } = render({ imagePickerBaseUrl: BASE_URL });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasToken).toBe(false);
  });

  it('reports a usable token', async () => {
    seedToken(jwt(3600));
    const { result } = render({ imagePickerBaseUrl: BASE_URL });
    await waitFor(() => expect(result.current.hasToken).toBe(true));
  });

  it('surfaces the content locale for the picker UI', async () => {
    noToken();
    const { result } = render({ imagePickerBaseUrl: BASE_URL });
    await waitFor(() => expect(result.current.configured).toBe(true));
    expect(result.current.locale).toBe('en-US');
  });

  it('tolerates a trailing slash on the base URL', async () => {
    noToken();
    const { result } = render({ imagePickerBaseUrl: `${BASE_URL}/` });
    await waitFor(() => expect(result.current.configured).toBe(true));
  });
});

describe('useImagePickerStatus outside a host', () => {
  it('defaults to unconfigured rather than throwing', () => {
    const { result } = renderHookWithProviders(() => useImagePickerStatus());
    expect(result.current).toEqual({
      configured: false,
      hasToken: false,
      loading: false,
    });
  });
});
