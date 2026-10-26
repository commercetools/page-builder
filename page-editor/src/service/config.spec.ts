import { SERVICE_FEATURES, parseServiceConfig } from './config';

const env = (over: Record<string, unknown> = {}) => ({
  pageBuilderServiceUrl: 'https://svc.example.com/service/',
  pageBuilderServiceHooks: 'all',
  ...over,
});

describe('parseServiceConfig', () => {
  it('is off without a service URL', () => {
    expect(parseServiceConfig(undefined)).toBeNull();
    expect(parseServiceConfig({})).toBeNull();
    expect(parseServiceConfig(env({ pageBuilderServiceUrl: '' }))).toBeNull();
    expect(parseServiceConfig(env({ pageBuilderServiceUrl: 42 }))).toBeNull();
  });

  it('is off for a URL that does not parse', () => {
    expect(
      parseServiceConfig(env({ pageBuilderServiceUrl: 'not a url' }))
    ).toBeNull();
  });

  it('is off when no hook family is selected', () => {
    expect(parseServiceConfig(env({ pageBuilderServiceHooks: '' }))).toBeNull();
    expect(
      parseServiceConfig(env({ pageBuilderServiceHooks: undefined }))
    ).toBeNull();
    expect(
      parseServiceConfig(env({ pageBuilderServiceHooks: 'nonsense, ' }))
    ).toBeNull();
  });

  it('splits the URL into origin and base path, dropping a trailing slash', () => {
    expect(parseServiceConfig(env())).toMatchObject({
      origin: 'https://svc.example.com',
      basePath: '/service',
    });
    expect(
      parseServiceConfig(
        env({ pageBuilderServiceUrl: 'https://svc.example.com' })
      )
    ).toMatchObject({
      origin: 'https://svc.example.com',
      basePath: '',
    });
  });

  it('`all` selects every family', () => {
    expect([...parseServiceConfig(env())!.features].sort()).toEqual(
      [...SERVICE_FEATURES].sort()
    );
  });

  it('selects only the listed families and ignores unknown names', () => {
    const features = parseServiceConfig(
      env({ pageBuilderServiceHooks: ' pages , comments,bogus' })
    )!.features;
    expect([...features].sort()).toEqual(['comments', 'pages']);
  });
});
