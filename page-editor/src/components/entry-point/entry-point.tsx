import { lazy } from 'react';
import {
  ApplicationShell,
  createApolloClient,
  setupGlobalErrorListener,
} from '@commercetools-frontend/application-shell';
import type { ApplicationWindow } from '@commercetools-frontend/constants';
import { NimbusProvider, NimbusI18nProvider } from '@commercetools/nimbus';
import { OrgDirectoryProvider } from '../../hooks/use-org-directory';
import loadMessages from '../../load-messages';

declare let window: ApplicationWindow;

// Keyframes for the page-builder save/publish spinners. Icons themselves come from
// @commercetools/nimbus-icons as React components, so no icon font is loaded.
if (typeof document !== 'undefined') {
  const pageBuilderStyle = document.createElement('style');
  pageBuilderStyle.textContent = `@keyframes pb-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(pageBuilderStyle);
}

// Here we split up the main (app) bundle with the actual application business logic.
const AsyncApplicationRoutes = lazy(
  () => import('../../routes' /* webpackChunkName: "routes" */)
);

// Ensure to setup the global error listener before any React component renders
// in order to catch possible errors on rendering/mounting.
setupGlobalErrorListener();

const configureApollo = () =>
  createApolloClient({
    cache: {
      typePolicies: {
        ProductVariant: {
          keyFields: ['sku', 'key'],
        },
      },
    },
  });

const EntryPoint = () => (
  <NimbusProvider>
    <NimbusI18nProvider locale="en-US">
      <ApplicationShell
        enableReactStrictMode
        environment={window.app}
        applicationMessages={loadMessages}
        apolloClient={configureApollo()}
      >
        <OrgDirectoryProvider>
          <AsyncApplicationRoutes />
        </OrgDirectoryProvider>
      </ApplicationShell>
    </NimbusI18nProvider>
  </NimbusProvider>
);
EntryPoint.displayName = 'EntryPoint';

export default EntryPoint;
