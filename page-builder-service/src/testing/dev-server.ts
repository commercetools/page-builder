/**
 * Runs the real service over the in-memory fake commercetools, seeded with a small shop and
 * content, for local development of the shim and the example host without credentials.
 *
 *   npm run dev:fake          # http://localhost:8080/service
 *
 * Preview token: `dev-preview`. Admin secret: `dev-admin`. Editor origin: http://localhost:3001 (the MC app dev server).
 */

import { createDeps } from '../app.js';
import { loadConfig } from '../config.js';
import { buildServer } from '../server.js';
import { createFakeCt } from './fake-ct.js';
import { CT_CONFIG, seedContent, seedShop } from './fixtures.js';

const fake = createFakeCt('us-store');
seedShop(fake);
seedContent(fake);

const config = {
  ...loadConfig({
    PORT: process.env.PORT ?? '8080',
    PB_BASE_PATH: process.env.PB_BASE_PATH ?? '/service',
    PB_PREVIEW_TOKEN: 'dev-preview',
    PB_ADMIN_SECRET: 'dev-admin',
    PB_EDITOR_ORIGINS: 'http://localhost:3001',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  }),
  ct: CT_CONFIG,
};

const app = buildServer(config, createDeps(config, { fetch: fake.fetch }));
await app.listen({ port: config.port, host: '127.0.0.1' });
app.log.info(`fake-ct dev service on http://127.0.0.1:${config.port}${config.basePath} (preview token: dev-preview, admin secret: dev-admin)`);
