import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { usePreviewSettingsFetcher } from '../../hooks/use-preview-settings-connector';
import { useCategorySampleProduct } from '../../hooks/use-product-search-connector';
import { buildPreviewUrl, resolvePreviewPageType } from './preview/preview-url';
import {
  useActivePreviewEnv,
  useLocalPreviewUrl,
  resolveActiveEnv,
  PREVIEW_ENVS,
} from './preview/use-preview-environment';
import type { PreviewEnv } from './preview/use-preview-environment';
import type { PageNode, PageTypeId, PreviewSettings } from './types';
import messages from './messages';

type UsePreviewTargetArgs = {
  pageId: string;
  pageNode: PageNode;
  pageType: PageTypeId;
  defaultLocale: string;
  /** True when there are unsaved edits — a refresh saves first. */
  dirty: boolean;
  /** Persist before re-rendering the host, so it re-pulls current content. */
  save: () => Promise<void>;
};

/**
 * Resolves *what URL the preview iframe should point at* and which environment
 * it belongs to: the merchant's preview settings, the per-browser
 * production/staging/local choice, the sample product a PDP preview needs, and
 * the cache-busting that forces the host to re-pull after a save.
 *
 * Deliberately separate from `usePreviewBridge`: this decides the target, the
 * bridge talks to whatever is loaded there.
 */
export const usePreviewTarget = ({
  pageId,
  pageNode,
  pageType,
  defaultLocale,
  dirty,
  save,
}: UsePreviewTargetArgs) => {
  const intl = useIntl();
  const settingsFetcher = usePreviewSettingsFetcher();

  const [settings, setSettings] = useState<PreviewSettings | null>(null);
  const [activeEnv, setActiveEnv] = useActivePreviewEnv();
  const [localPreviewUrl] = useLocalPreviewUrl();
  const [locale, setLocale] = useState<string>('');
  const [cacheBust, setCacheBust] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const autoAppliedFor = useRef<string | null>(null);

  useEffect(() => {
    if (settingsFetcher.loading) return;
    if (settingsFetcher.settings) {
      setSettings(settingsFetcher.settings);
      setLocale((prev) => prev || settingsFetcher.settings!.defaultLocale);
    }
  }, [settingsFetcher.loading, settingsFetcher.settings]);

  // PDP preview needs a real sample product. For a category PDP
  // (`pdp-<categoryId>`) use the first product in that category; for the "All
  // categories" PDP (`pdp-cat-root`), `cat-root` is a synthetic id (not a real
  // category), so fall back to the first product in the whole catalog.
  const isPdpPage = pageId === 'pdp' || pageId.startsWith('pdp-');
  const pdpRawCategoryId = pageId.startsWith('pdp-')
    ? pageId.slice('pdp-'.length)
    : null;
  const { product: categorySampleProduct } = useCategorySampleProduct(
    isPdpPage,
    pdpRawCategoryId && pdpRawCategoryId !== 'cat-root'
      ? pdpRawCategoryId
      : null,
    defaultLocale
  );

  const resolvedEnv = resolveActiveEnv(settings, localPreviewUrl, activeEnv);
  const enabled = !!settings?.enabled && !!resolvedEnv.baseUrl;

  const previewPageType = resolvePreviewPageType(
    settings ?? { homePageId: 'home' },
    pageId,
    pageType
  );
  const slug =
    previewPageType === 'pdp'
      ? categorySampleProduct?.slug ?? settings?.samples?.pdp?.slug
      : previewPageType === 'category'
      ? pageNode.slug ?? pageId
      : pageId;
  const sku =
    previewPageType === 'pdp'
      ? categorySampleProduct?.sku ?? settings?.samples?.pdp?.sku
      : undefined;

  const url = buildPreviewUrl(
    settings
      ? { ...settings, baseUrl: resolvedEnv.baseUrl, token: resolvedEnv.token }
      : settings,
    {
      previewPageType,
      locale,
      slug,
      sku,
      // The custom-object key suffix — the host loads `page-<pageId>` directly.
      pageEditorId: pageId,
      edit: true,
      origin: window.location.origin,
      cacheBust: cacheBust ?? undefined,
    }
  );

  // Default to Preview once Preview Settings has resolved, is enabled, and
  // this page's type has a usable route — but only once per pageId, so it
  // never re-applies over a manual switch back to Edit later in the session.
  // Waits for `settings` (the local mirror, populated by the effect above) to
  // actually sync in before marking itself "done" — the fetcher's `loading`
  // flag flips to false one render before that mirror updates, so checking
  // `settingsFetcher.loading` alone here would mark this page as handled while
  // `settings` was still null, permanently skipping the real check on the very
  // next render where it becomes available.
  useEffect(() => {
    if (settingsFetcher.loading || !settings) return;
    if (autoAppliedFor.current === pageId) return;
    autoAppliedFor.current = pageId;
    if (settings.enabled && url) setViewMode('preview');
  }, [pageId, settingsFetcher.loading, settings, url]);

  const changeViewMode = async (next: 'edit' | 'preview') => {
    if (next === 'preview') {
      if (dirty) await save();
      setCacheBust(Date.now());
    }
    setViewMode(next);
  };

  const refresh = async () => {
    if (dirty) await save();
    setCacheBust(Date.now());
  };

  const changeEnv = (env: string) => {
    setActiveEnv(env as PreviewEnv);
    setCacheBust(Date.now());
  };

  // The active environment (production/staging/local) is a per-browser choice
  // surfaced as a switcher in the preview toolbar; the settings themselves live
  // in the Pages dashboard and the builder only reads them.
  const envOptions = PREVIEW_ENVS.map((id) => ({
    id,
    label: intl.formatMessage(
      id === 'production'
        ? messages.previewEnvProduction
        : id === 'staging'
        ? messages.previewEnvStaging
        : messages.previewEnvLocal
    ),
  }));

  return {
    settings,
    enabled,
    url,
    locale,
    setLocale,
    hostOrigin: resolvedEnv.baseUrl,
    viewMode,
    changeViewMode,
    refresh,
    activeEnv,
    changeEnv,
    envOptions,
  };
};
