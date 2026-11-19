import {
  MEDIA_NOT_CONFIGURED,
  MediaServiceError,
  createMediaClient,
  isMediaNotConfigured,
  toMediaFailure,
} from './media';
import type { ServiceRequest } from './service-link';

const respond = (status: number, json: unknown) =>
  jest.fn<ReturnType<ServiceRequest>, Parameters<ServiceRequest>>(async () => ({
    status,
    json,
  }));

describe('createMediaClient.list', () => {
  it('asks for one kind, with the page options the caller gave', async () => {
    const request = respond(200, { files: [], nextCursor: null });

    const page = await createMediaClient(request).list('image', {
      cursor: 'tok',
      limit: 12,
    });

    expect(page).toEqual({ files: [], nextCursor: null });
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/admin/media',
      query: { type: 'image', limit: 12, cursor: 'tok' },
    });
  });

  it('omits the cursor and limit on a first page', async () => {
    const request = respond(200, { files: [], nextCursor: null });
    await createMediaClient(request).list('video');
    expect(request.mock.calls[0]![0].query).toEqual({
      type: 'video',
      limit: undefined,
      cursor: undefined,
    });
  });

  it('turns the service error body into a typed error', async () => {
    const request = respond(502, {
      error: {
        code: 'storage_unavailable',
        message: 'Media storage is unavailable',
      },
    });
    await expect(createMediaClient(request).list('image')).rejects.toEqual(
      new MediaServiceError(
        502,
        'storage_unavailable',
        'Media storage is unavailable'
      )
    );
  });

  it('survives an error body it does not recognise', async () => {
    const err = await createMediaClient(respond(500, '<html>oops</html>'))
      .list('image')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      status: 500,
      code: 'unknown',
      message: 'The media service answered 500',
    });
  });
});

describe('a refusal that did not come from the service', () => {
  it('reads a bare 413 from a proxy as "too large"', async () => {
    const err = await createMediaClient(
      respond(413, '<html>Payload Too Large</html>')
    )
      .upload(new File(['x'], 'a.png', { type: 'image/png' }))
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 413, code: 'file_too_large' });
  });
});

describe('createMediaClient.upload', () => {
  const file = new File(['png-bytes'], 'hero.png', { type: 'image/png' });
  const stored = {
    url: 'https://storage.googleapis.com/b/k.png',
    key: 'k.png',
    name: 'k.png',
    size: 9,
    contentType: 'image/png',
  };

  it('posts the file as multipart form data under the name "file"', async () => {
    const request = respond(201, stored);

    expect(await createMediaClient(request).upload(file)).toEqual(stored);

    const call = request.mock.calls[0]![0];
    expect(call).toMatchObject({ method: 'POST', path: '/v1/admin/media' });
    expect(call.body).toBeInstanceOf(FormData);
    const sent = (call.body as FormData).get('file') as File;
    expect(sent.name).toBe('hero.png');
    expect(sent.type).toBe('image/png');
  });

  it.each([
    [413, 'file_too_large'],
    [415, 'type_mismatch'],
    [501, MEDIA_NOT_CONFIGURED],
  ])('rejects with the service code on a %i', async (status, code) => {
    const request = respond(status, { error: { code, message: 'nope' } });
    await expect(createMediaClient(request).upload(file)).rejects.toMatchObject(
      { status, code }
    );
  });

  it('does not take a 200 for an upload', async () => {
    await expect(
      createMediaClient(respond(200, {})).upload(file)
    ).rejects.toBeInstanceOf(MediaServiceError);
  });
});

describe('toMediaFailure', () => {
  it('keeps what the service said, and describes anything else as a network failure', () => {
    expect(
      toMediaFailure(new MediaServiceError(415, 'type_mismatch', 'No'))
    ).toEqual({
      code: 'type_mismatch',
      message: 'No',
    });
    expect(toMediaFailure(new TypeError('Failed to fetch'))).toEqual({
      code: 'network',
      message: 'Failed to fetch',
    });
    expect(toMediaFailure('weird')).toEqual({
      code: 'network',
      message: 'Request failed',
    });
  });
});

describe('isMediaNotConfigured', () => {
  it('recognises only the not-configured answer', () => {
    expect(
      isMediaNotConfigured(
        new MediaServiceError(501, MEDIA_NOT_CONFIGURED, 'x')
      )
    ).toBe(true);
    expect(
      isMediaNotConfigured(
        new MediaServiceError(502, 'storage_unavailable', 'x')
      )
    ).toBe(false);
    expect(isMediaNotConfigured(new Error('boom'))).toBe(false);
  });
});
