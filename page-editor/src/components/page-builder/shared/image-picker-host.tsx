import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { ImagePickerProvider } from '@commercetools-demo/puck-image-picker';
import { useImagePickerToken } from '../../../hooks/use-image-picker-token';

/** Namespaces media storage on the service when no key is configured. */
const DEFAULT_BUSINESS_UNIT_KEY = 'default';

export type ImagePickerStatus = {
  /**
   * Whether an `<ImagePickerProvider>` is mounted above. False → `MediaField` must not
   * render `ImagePickerField`, whose `useImagePickerContext` throws without the provider.
   */
  configured: boolean;
  /** A usable service JWT is available, so uploading (not just browsing) will work. */
  hasToken: boolean;
  /** The token is still being read from, or refreshed against, its custom object. */
  loading: boolean;
  /** Content locale for the picker's own UI strings. */
  locale?: string;
};

const ImagePickerStatusContext = createContext<ImagePickerStatus>({
  configured: false,
  hasToken: false,
  loading: false,
});

export const useImagePickerStatus = (): ImagePickerStatus =>
  useContext(ImagePickerStatusContext);

/**
 * Supplies the media-service connection for every `kind: 'image'` field below it.
 *
 * Mounted once at the page-builder root rather than per field: the provider owns a JWT
 * that has to be fetched from — and possibly refreshed into — a custom object, and doing
 * that per field would multiply the reads and race the write-back.
 *
 * When `IMAGE_PICKER_BASE_URL` is unset (or the project key is unavailable) it renders
 * children untouched and reports `configured: false`, so the feature degrades to a note.
 */
export function ImagePickerHost({ children }: { children: ReactNode }) {
  const baseUrl = useApplicationContext(
    (ctx) =>
      (ctx.environment as Record<string, unknown> | undefined)
        ?.imagePickerBaseUrl as string | undefined
  );
  const businessUnitKey = useApplicationContext(
    (ctx) =>
      (ctx.environment as Record<string, unknown> | undefined)
        ?.imagePickerBusinessUnitKey as string | undefined
  );
  const projectKey = useApplicationContext((ctx) => ctx.project?.key);
  const dataLocale = useApplicationContext((ctx) => ctx.dataLocale);

  const { token, loading, refreshing } = useImagePickerToken(baseUrl);

  const configured = !!baseUrl && !!projectKey;
  const locale = dataLocale ?? undefined;

  const status = useMemo<ImagePickerStatus>(
    () => ({
      configured,
      hasToken: !!token,
      loading: loading || refreshing,
      locale,
    }),
    [configured, token, loading, refreshing, locale]
  );

  // Checked against the raw values rather than `configured` so both narrow to `string`.
  if (!baseUrl || !projectKey) {
    return (
      <ImagePickerStatusContext.Provider value={status}>
        {children}
      </ImagePickerStatusContext.Provider>
    );
  }

  return (
    <ImagePickerStatusContext.Provider value={status}>
      <ImagePickerProvider
        baseURL={baseUrl.replace(/\/$/, '')}
        projectKey={projectKey}
        businessUnitKey={businessUnitKey || DEFAULT_BUSINESS_UNIT_KEY}
        jwtToken={token ?? undefined}
        locale={locale}
      >
        {children}
      </ImagePickerProvider>
    </ImagePickerStatusContext.Provider>
  );
}
