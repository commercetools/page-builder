import { PERMISSIONS } from './src/constants';

/**
 * Optional settings. A `${env:NAME}` placeholder throws when NAME is not set, which would fail the
 * build and the start of the app for a setting that is optional, so optional values are read here
 * and an unset one is an empty string (each means "not configured" in the app).
 */
const optionalEnv = (name) => process.env[name] ?? '';

/**
 * @type {import('@commercetools-frontend/application-config').ConfigOptionsForCustomApplication}
 */
const config = {
  name: 'Page Editor',
  description:
    'A Merchant Center Custom Application that gives content and merchandising teams a visual way to build and manage storefront pages. It covers the full authoring lifecycle: define reusable component types, wire them to data feeds, compose pages on a drag-and-drop canvas, then publish — all stored as commercetools custom objects that a storefront renderer can consume at runtime.',
  entryPointUriPath: '${env:ENTRY_POINT_URI_PATH}',
  cloudIdentifier: '${env:CLOUD_IDENTIFIER}',
  env: {
    development: {
      initialProjectKey: '${env:INITIAL_PROJECT_KEY}',
    },
    production: {
      applicationId: '${env:CUSTOM_APPLICATION_ID}',
      url: '${env:APPLICATION_URL}',
    },
  },
  additionalEnv: {
    // Surfaced onto `context.environment.imagePickerBaseUrl`. The contentools media
    // service base URL — it MUST include the service's `/service` path prefix and carry
    // no trailing slash. Empty → `kind: 'image'` fields render a "not configured" note
    // instead of the picker.
    imagePickerBaseUrl: optionalEnv('IMAGE_PICKER_BASE_URL'),
    // Namespaces media storage on the service (a path segment). Empty → 'default'.
    imagePickerBusinessUnitKey: optionalEnv('IMAGE_PICKER_BUSINESS_UNIT_KEY'),
    // The page-builder service's public URL including its Connect path (e.g.
    // https://service-….commercetools.app/service). Empty → every hook uses the MC GraphQL gateway.
    pageBuilderServiceUrl: optionalEnv('PAGE_BUILDER_SERVICE_URL'),
    // Which hook families use the service: `all`, or a comma list of pages, page-components,
    // comments, workflows, page-workflow, preview-settings, data-sources, sections, components,
    // instances, reset. Empty → none. Lets the migration roll out (and back) one family at a time.
    pageBuilderServiceHooks: optionalEnv('PAGE_BUILDER_SERVICE_HOOKS'),
  },
  oAuthScopes: {
    view: ['view_products'],
    manage: ['manage_products'],
  },
  headers: {
    csp: {
      'frame-src': [
        "'self'",
        'https://*.commercetools.com',
        'https://*.netlify.app',
        'http://localhost:3000',
      ],
      // `*.run.app` / `localhost:8080` reach the contentools media service directly — the image
      // picker calls `media-library`, `upload-file` and `refresh-jwt` from the browser, not
      // through the MC gateway proxy.
      'connect-src': [
        "'self'",
        'https://*.commercetools.com',
        'https://*.netlify.app',
        'http://localhost:3000',
        'https://*.run.app',
        'http://localhost:8080',
      ],
      // The picker renders `<img>` for every media-library thumbnail and for the selected
      // value, so the service's storage backend must be allowed. Which one applies depends on
      // its STORAGE_TYPE (gcp / aws / cloudinary); the seeded hero image is on GCS.
      'img-src': [
        "'self'",
        'data:',
        'https://*.commercetools.com',
        'https://storage.googleapis.com',
        'https://*.amazonaws.com',
        'https://res.cloudinary.com',
      ],
    },
  },
  // Component/data-source/section definitions are now owned by the host code and
  // synced into CT by the page-builder service's catalog ingest; the Merchant Center
  // app only reads the published catalog. The former editor permission groups were
  // removed with their routes.
  icon: '${path:./assets/template-icon.svg}',
  mainMenuLink: {
    defaultLabel: 'Page Editor',
    labelAllLocales: [],
    permissions: [PERMISSIONS.View],
  },
  submenuLinks: [
    {
      uriPath: 'pages',
      defaultLabel: 'Pages',
      labelAllLocales: [],
      permissions: [PERMISSIONS.View],
    },
    {
      uriPath: 'workflows',
      defaultLabel: 'Workflows',
      labelAllLocales: [],
      permissions: [PERMISSIONS.View],
    },
  ],
};

export default config;
