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
  'PAGE_BUILDER_SERVICE_DEV_TOKEN',
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

  describe('the development token for calling the service directly', () => {
    const env = process.env as Record<string, string | undefined>;
    const nodeEnv = env.NODE_ENV;
    afterEach(() => {
      env.NODE_ENV = nodeEnv;
    });

    /** The `additionalEnv` the config file declares, evaluated afresh for the given mode and token. */
    const additionalEnv = (mode: string, token?: string) => {
      withEnv(REQUIRED);
      env.NODE_ENV = mode;
      if (token !== undefined) env.PAGE_BUILDER_SERVICE_DEV_TOKEN = token;
      let declared: Record<string, string> = {};
      jest.isolateModules(() => {
        // eslint-disable-next-line import/extensions
        declared = require('../custom-application-config.mjs').default
          .additionalEnv;
      });
      return declared;
    };

    it('is read for `yarn start`', () => {
      expect(additionalEnv('development', 'secret-token')).toMatchObject({
        pageBuilderServiceDevToken: 'secret-token',
      });
    });

    it.each(['production', 'test'])(
      'is never read when NODE_ENV is %s, so it cannot reach a deployed build',
      (mode) => {
        const declared = additionalEnv(mode, 'secret-token');
        expect(declared.pageBuilderServiceDevToken).toBe('');
        expect(JSON.stringify(declared)).not.toContain('secret-token');
      }
    );

    it('is empty when none is set', () => {
      expect(additionalEnv('development').pageBuilderServiceDevToken).toBe('');
    });
  });
});
