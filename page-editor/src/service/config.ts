/**
 * Which page-builder data hooks talk to the page-builder service instead of the Merchant Center
 * GraphQL gateway. Resolved from the app's `additionalEnv`:
 *
 *   pageBuilderServiceUrl    the service's public URL including its Connect path, e.g.
 *                            https://service-….commercetools.app/service (empty: service off)
 *   pageBuilderServiceHooks  `all`, or a comma list of the feature names below (empty: none)
 *
 * The per-hook list lets the migration roll out (and roll back) one hook family at a time.
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

export type ServiceConfig = {
  /** Origin of the service, no trailing slash and no path. */
  origin: string;
  /** Path prefix of the service (its Connect endpoint), no trailing slash. */
  basePath: string;
  features: ReadonlySet<ServiceFeature>;
};

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export function parseServiceConfig(
  env: Record<string, unknown> | undefined
): ServiceConfig | null {
  const raw = text(env?.pageBuilderServiceUrl);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

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

  return {
    origin: url.origin,
    basePath: url.pathname.replace(/\/+$/, ''),
    features,
  };
}
