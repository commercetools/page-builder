import { processConfig } from '@commercetools-frontend/application-config';

/**
 * A `${env:NAME}` placeholder throws when NAME is not set, which fails the build and the start of the
 * app. The settings Connect marks optional must therefore never be placeholders in the config file.
 */
const REQUIRED = {
  ENTRY_POINT_URI_PATH: 'page-editor',
  CLOUD_IDENTIFIER: 'gcp-eu',
  INITIAL_PROJECT_KEY: 'a-project',
  CUSTOM_APPLICATION_ID: 'an-id',
  APPLICATION_URL: 'https://app.example.test',
};
const OPTIONAL = [
  'PAGE_BUILDER_SERVICE_URL',
  'PAGE_BUILDER_SERVICE_HOOKS',
] as const;

const original = { ...process.env };

function withEnv(env: Record<string, string>) {
  for (const key of [...OPTIONAL, ...Object.keys(REQUIRED)])
    delete process.env[key];
  Object.assign(process.env, env);
}

afterEach(() => {
  for (const key of [...OPTIONAL, ...Object.keys(REQUIRED)])
    delete process.env[key];
  Object.assign(process.env, original);
});

describe('custom application config', () => {
  it('loads when none of the optional settings are provided', async () => {
    withEnv(REQUIRED);
    await expect(
      processConfig({ processEnv: process.env, disableCache: true })
    ).resolves.toBeDefined();
  });

  it.each(OPTIONAL)('loads when only %s is missing', async (missing) => {
    withEnv({
      ...REQUIRED,
      ...Object.fromEntries(
        OPTIONAL.filter((k) => k !== missing).map((k) => [k, 'x'])
      ),
    });
    await expect(
      processConfig({ processEnv: process.env, disableCache: true })
    ).resolves.toBeDefined();
  });

  it('still requires the settings the application cannot run without', async () => {
    const { APPLICATION_URL: _omitted, ...rest } = REQUIRED;
    withEnv(rest);
    await expect(
      processConfig({ processEnv: process.env, disableCache: true })
    ).rejects.toThrow('APPLICATION_URL');
  });
});
