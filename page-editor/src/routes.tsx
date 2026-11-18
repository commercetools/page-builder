import { lazy, Suspense } from 'react';
import { Switch, Route, Redirect, useRouteMatch } from 'react-router-dom';
import { LoadingSpinner } from '@commercetools/nimbus';

const AsyncPages = lazy(() => import('./components/pages'));
const AsyncPageBuilder = lazy(() => import('./components/page-builder'));
const AsyncWorkflows = lazy(() => import('./components/workflows'));
const AsyncReset = lazy(() => import('./components/reset'));

const ApplicationRoutes = () => {
  const match = useRouteMatch();

  return (
    <Suspense
      fallback={
        <div style={{ padding: 24 }}>
          <LoadingSpinner aria-label="Loading content" />
        </div>
      }
    >
      <Switch>
        <Route exact path={`${match.path}/pages`}>
          <AsyncPages />
        </Route>
        <Route path={`${match.path}/builder/:pageId`}>
          <AsyncPageBuilder />
        </Route>
        <Route exact path={`${match.path}/workflows`}>
          <AsyncWorkflows />
        </Route>
        {/* Hidden maintenance route — intentionally omitted from the app menu
            (custom-application-config submenuLinks). Reach it via URL only. */}
        <Route exact path={`${match.path}/reset`}>
          <AsyncReset />
        </Route>
        <Route exact path={match.path}>
          <Redirect to={`${match.url}/pages`} />
        </Route>
        <Route>
          <Redirect to={`${match.url}/pages`} />
        </Route>
      </Switch>
    </Suspense>
  );
};

ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
