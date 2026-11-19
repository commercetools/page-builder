/**
 * Builders for storefront-preview settings.
 */
import type {
  PreviewEnvironments,
  PreviewEnvUrl,
  PreviewRouteTemplates,
  PreviewSettings,
} from '../../components/page-builder/types';

export const buildPreviewRoutes = (
  over: Partial<PreviewRouteTemplates> = {}
): PreviewRouteTemplates => ({
  home: '/{locale}',
  category: '/{locale}/category/{slug}',
  pdp: '/{locale}/{slug}/p/{sku}',
  content: '/{locale}/{slug}',
  ...over,
});

export const buildPreviewEnvUrl = (
  over: Partial<PreviewEnvUrl> = {}
): PreviewEnvUrl => ({ baseUrl: 'https://shop.example.test', ...over });

export const buildPreviewEnvironments = (
  over: Partial<PreviewEnvironments> = {}
): PreviewEnvironments => ({
  production: buildPreviewEnvUrl(),
  staging: buildPreviewEnvUrl({ baseUrl: 'https://staging.example.test' }),
  ...over,
});

export const buildPreviewSettings = (
  over: Partial<PreviewSettings> = {}
): PreviewSettings => ({
  enabled: true,
  baseUrl: 'https://shop.example.test',
  defaultLocale: 'en-us',
  locales: ['en-us', 'de-de'],
  routes: buildPreviewRoutes(),
  environments: buildPreviewEnvironments(),
  ...over,
});
