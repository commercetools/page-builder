/**
 * Which page-builder data hooks talk to the page-builder service instead of the Merchant Center
 * GraphQL gateway. Resolved from the app's `additionalEnv`:
 *
 *   pageBuilderServiceUrl    the service's public URL including its Connect path, e.g.
 *                            https://service-….commercetools.app/service (empty: service off)
 *   pageBuilderServiceHooks  `all`, or a comma list of the feature names below (empty: none)
 *
 * The per-hook list lets the migration roll out (and roll back) one hook family at a time.
 *
 * Media uploads need only the URL, not a hook family: see `parseServiceEndpoint`.
 */

export const SERVICE_FEATURES = [
  'pages',
  'page-components',
  'comments',
  'workflows',
  'page-workflow',
  'preview-settings',
  'data-sources',
  'sections',
  'components',
  'instances',
  'reset',
] as const;

export type ServiceFeature = (typeof SERVICE_FEATURES)[number];

export type ServiceEndpoint = {
  /** Origin of the service, no trailing slash and no path. */
  origin: string;
  /** Path prefix of the service (its Connect endpoint), no trailing slash. */
  basePath: string;
};

export type ServiceConfig = ServiceEndpoint & {
  features: ReadonlySet<ServiceFeature>;
};

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Where the service is, independent of which hook families use it. `null` when no (valid) URL is
 * configured. Features that are not custom-object hooks — media uploads — need only this.
 */
export function parseServiceEndpoint(
  env: Record<string, unknown> | undefined
): ServiceEndpoint | null {
  const raw = text(env?.pageBuilderServiceUrl);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return { origin: url.origin, basePath: url.pathname.replace(/\/+$/, '') };
}

export function parseServiceConfig(
  env: Record<string, unknown> | undefined
): ServiceConfig | null {
  const endpoint = parseServiceEndpoint(env);
  if (!endpoint) return null;

  const hooks = text(env?.pageBuilderServiceHooks);
  const names =
    hooks === 'all'
      ? [...SERVICE_FEATURES]
      : hooks.split(',').map((s) => s.trim());
  const features = new Set(
    names.filter((n): n is ServiceFeature =>
      (SERVICE_FEATURES as readonly string[]).includes(n)
    )
  );
  if (features.size === 0) return null;

  return { ...endpoint, features };
}
