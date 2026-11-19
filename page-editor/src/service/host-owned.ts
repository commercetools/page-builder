/**
 * Objects in the `page-editor` container that the host owns: the catalog is pushed by the
 * storefront's CI through catalog ingest, and the service refuses to change it from the MC app.
 */
export const HOST_OWNED_KEYS: readonly string[] = [
  'components',
  'data-sources',
  'sections',
  'theme',
];
