/**
 * The render harness every component test should use.
 *
 * `renderApp` from the application shell already supplies the ApplicationContext,
 * Apollo, react-intl, the router and the Redux store. What it does not know about is
 * the pair of Nimbus providers `components/entry-point/entry-point.tsx` mounts above
 * it — without those, any Nimbus component renders unstyled and its Radix internals
 * misbehave under jsdom. This wraps one around the other so a test never has to
 * assemble a provider tree itself.
 *
 * Network traffic is served by MSW (see `./msw`), not by Apollo's MockedProvider, so
 * the default path exercises the real Apollo links the hooks run through. Pass
 * `mocks` when a narrow, document-level Apollo mock is genuinely a better fit.
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { NimbusProvider, NimbusI18nProvider } from '@commercetools/nimbus';
import { createApolloClient } from '@commercetools-frontend/application-shell';
import {
  renderApp,
  renderAppWithRedux,
  hooks,
  type TRenderAppOptions,
} from '@commercetools-frontend/application-shell/test-utils';

/** UI locale used unless a test asks for another. Matches the app's own default. */
export const DEFAULT_LOCALE = 'en';

/** Locale for localized *data* (component names, section titles, settings values). */
export const DEFAULT_DATA_LOCALE = 'en-US';

/** A project stub with the fields the page editor's components actually read. */
export const DEFAULT_PROJECT = {
  key: 'test-project',
  version: 1,
  name: 'Test project',
  countries: ['DE', 'US'],
  currencies: ['EUR', 'USD'],
  languages: ['en-US', 'de-DE'],
  ownerId: 'test-owner',
};

export const DEFAULT_USER = {
  id: 'user-1',
  email: 'tester@example.test',
  firstName: 'Tess',
  lastName: 'Tester',
  locale: DEFAULT_LOCALE,
};

type NimbusWrapperProps = { children?: ReactNode };

/**
 * The app's Nimbus providers, as a wrapper RTL can compose. `locale` here is the
 * Nimbus i18n locale, which the app pins to `en-US` regardless of the MC locale.
 */
export const createNimbusWrapper =
  (nimbusLocale = 'en-US'): ComponentType<NimbusWrapperProps> =>
  ({ children }: NimbusWrapperProps) =>
    (
      <NimbusProvider>
        <NimbusI18nProvider locale={nimbusLocale}>
          {children}
        </NimbusI18nProvider>
      </NimbusProvider>
    );

/**
 * The same cache configuration `components/entry-point/entry-point.tsx` installs.
 * Without it a test caches ProductVariants by the default id, while production keys
 * them on sku+key — so normalization bugs would only ever show up in the real app.
 */
export const createTestApolloClient = () =>
  createApolloClient({
    cache: { typePolicies: { ProductVariant: { keyFields: ['sku', 'key'] } } },
  });

export type RenderWithProvidersOptions = Partial<TRenderAppOptions> & {
  /** Nimbus i18n locale; independent of the MC `locale` option. */
  nimbusLocale?: string;
};

/**
 * `PB_TEST_TRANSPORT=service` runs the whole suite with every page-builder hook family routed
 * through the service transport (backed in-process by the same custom-object store), proving the
 * service path behaves exactly like the Merchant Center GraphQL path.
 */
export const SERVICE_TRANSPORT = process.env.PB_TEST_TRANSPORT === 'service';

const withDefaults = ({
  nimbusLocale,
  ...options
}: RenderWithProvidersOptions = {}) => ({
  locale: DEFAULT_LOCALE,
  route: '/',
  project: DEFAULT_PROJECT,
  user: DEFAULT_USER,
  // The locale localized *data* is displayed in. Without it `formatLocalizedString`
  // treats every value as a fallback and annotates it — "Main (EN-US)" instead of
  // "Main" — which makes text assertions fail for a reason that has nothing to do
  // with the component under test.
  dataLocale: DEFAULT_DATA_LOCALE,
  // Route permission checks are an MC concern, not this app's; leaving them on
  // makes every render depend on a permissions fixture for no test value.
  disableRoutePermissionCheck: true,
  // Without this the shell only renders children under the app's configured
  // `entryPointUriPath` and serves its 404 page everywhere else — so a component
  // test that just wants to mount one component gets "We could not find what you
  // are looking for". Tests that care about routing pass `route` and turn this off.
  disableAutomaticEntryPointRoutes: true,
  // Only build a client when the test is not supplying `mocks`, which selects
  // Apollo's MockedProvider path instead.
  ...(options.mocks ? {} : { apolloClient: createTestApolloClient() }),
  ...options,
  // A test that sets `environment` itself is controlling the transport and is left alone.
  ...(SERVICE_TRANSPORT && !options.environment
    ? {
        environment: {
          pageBuilderServiceUrl: 'https://service.test/service',
          pageBuilderServiceHooks: 'all',
        },
      }
    : {}),
  wrapper: options.wrapper ?? createNimbusWrapper(nimbusLocale),
});

/**
 * Render a component with every provider the real app mounts.
 *
 * `renderApp` already returns a `user` key holding the MC *user fixture*, which
 * collides with the near-universal convention of `user` meaning userEvent. Since
 * tests reach for the latter constantly and the former almost never, `user` is
 * userEvent here and the fixture is re-exposed as `appUser`.
 */
export const renderWithProviders = (
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
) => {
  const rendered = renderApp(ui, withDefaults(options));
  return { ...rendered, appUser: rendered.user, user: userEvent.setup() };
};

/** Same, for the handful of components that read from the Redux store. */
export const renderWithReduxProviders = (
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
) => {
  const rendered = renderAppWithRedux(ui, withDefaults(options));
  return { ...rendered, appUser: rendered.user, user: userEvent.setup() };
};

/**
 * Render a hook inside the same provider tree.
 *
 * `initialProps` is forwarded to Testing Library's own `renderHook`, so a hook
 * can be re-rendered with different arguments via the returned `rerender`.
 */
export const renderHookWithProviders = <Props, Result>(
  callback: (props: Props) => Result,
  options: RenderWithProvidersOptions & { initialProps?: Props } = {}
) => hooks.renderHook<Props, Result>(callback, withDefaults(options));

export { userEvent };

// Re-exported so a spec needs one import for `screen`, `waitFor`, `within`, etc.
export * from '@commercetools-frontend/application-shell/test-utils';
