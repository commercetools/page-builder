import { Route } from 'react-router-dom';
import ApplicationRoutes from './routes';
import { renderWithProviders, screen, waitFor } from './test-utils/render';

/**
 * The routes lazily import whole feature areas, so each is stubbed here — this
 * asserts the routing table, not the screens (which have their own specs).
 */
jest.mock('./components/pages', () => ({
  __esModule: true,
  default: () => <div>PAGES SCREEN</div>,
}));
jest.mock('./components/page-builder', () => ({
  __esModule: true,
  default: () => <div>BUILDER SCREEN</div>,
}));
jest.mock('./components/workflows', () => ({
  __esModule: true,
  default: () => <div>WORKFLOWS SCREEN</div>,
}));
jest.mock('./components/reset', () => ({
  __esModule: true,
  default: () => <div>RESET SCREEN</div>,
}));

const setup = (route: string) =>
  renderWithProviders(
    <Route path="/app">
      <ApplicationRoutes />
    </Route>,
    { route }
  );

describe('ApplicationRoutes', () => {
  it('serves the pages dashboard', async () => {
    setup('/app/pages');
    expect(await screen.findByText('PAGES SCREEN')).toBeInTheDocument();
  });

  it('serves the builder for a page', async () => {
    setup('/app/builder/home');
    expect(await screen.findByText('BUILDER SCREEN')).toBeInTheDocument();
  });

  it('serves the workflows screen', async () => {
    setup('/app/workflows');
    expect(await screen.findByText('WORKFLOWS SCREEN')).toBeInTheDocument();
  });

  it('serves the hidden reset screen by URL', async () => {
    setup('/app/reset');
    expect(await screen.findByText('RESET SCREEN')).toBeInTheDocument();
  });

  it('redirects the app root to pages', async () => {
    const { history } = setup('/app');
    await waitFor(() => expect(history.location.pathname).toBe('/app/pages'));
  });

  it('redirects an unknown path to pages rather than 404ing', async () => {
    const { history } = setup('/app/nonsense');
    await waitFor(() => expect(history.location.pathname).toBe('/app/pages'));
  });

  it('resolves a lazily-imported screen through the Suspense boundary', async () => {
    // Each screen is a `lazy()` import; it only appears if the boundary caught
    // the promise rather than the tree throwing.
    setup('/app/pages');
    expect(await screen.findByText('PAGES SCREEN')).toBeInTheDocument();
  });
});
