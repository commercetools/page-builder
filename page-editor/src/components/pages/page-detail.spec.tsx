import PageDetail from './page-detail';
import {
  DRAFT_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  pageKey,
} from '../page-builder/types';
import { renderWithProviders, screen, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildDraftPagePayload,
  buildPageNode,
  buildPublishedPagePayload,
} from '../../test-utils/factories';

const store = installMockServer();

const seedDraft = (pageId: string, value: unknown) =>
  store.seed({ container: DRAFT_PAGE_CONTAINER, key: pageKey(pageId), value });
const seedPublished = (pageId: string, value: unknown) =>
  store.seed({
    container: PUBLISHED_PAGE_CONTAINER,
    key: pageKey(pageId),
    value,
  });

const setup = (over: Partial<Parameters<typeof PageDetail>[0]> = {}) => {
  const onSelectPage = jest.fn();
  const node = over.node ?? buildPageNode({ id: 'home', title: 'Homepage' });
  const rendered = renderWithProviders(
    <PageDetail
      node={node}
      onSelectPage={onSelectPage}
      basePath="/app"
      pageTree={[node]}
      {...over}
    />,
    { route: '/app/pages' }
  );
  return { node, onSelectPage, ...rendered };
};

describe('PageDetail', () => {
  it('names the page it is describing', async () => {
    setup();
    // The title appears in both the header and the breadcrumb.
    expect((await screen.findAllByText('Homepage')).length).toBeGreaterThan(0);
  });

  it('lists the project languages rather than a hardcoded set', async () => {
    setup();
    await screen.findAllByText('Homepage');
    // The harness project declares en-US and de-DE.
    expect(await screen.findByText('EN, DE')).toBeInTheDocument();
  });

  it('reports how recently the page was saved', async () => {
    seedDraft('home', buildDraftPagePayload());
    setup();
    await screen.findAllByText('Homepage');
    // A saved page surfaces its version history section.
    await waitFor(() =>
      expect(screen.getAllByText(/version/i).length).toBeGreaterThan(0)
    );
  });

  it('reports a published page', async () => {
    seedPublished('home', buildPublishedPagePayload({ appVersion: 3 }));
    setup();
    await waitFor(() =>
      expect(screen.getAllByText(/published/i).length).toBeGreaterThan(0)
    );
  });

  it('reports a draft-only page', async () => {
    seedDraft('home', buildDraftPagePayload());
    setup();
    await waitFor(() =>
      expect(screen.getAllByText(/draft/i).length).toBeGreaterThan(0)
    );
  });

  it('offers a category/product view switch for a category', async () => {
    setup({
      node: buildPageNode({ id: 'shoes', title: 'Shoes', type: 'category' }),
    });
    await screen.findAllByText('Shoes');

    // The label appears in the switcher and again in the assignment card.
    expect(
      (await screen.findAllByText('Category page')).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Product detail page').length).toBeGreaterThan(
      0
    );
  });

  it('describes the PDP assignment when opened on that view', async () => {
    // The inherited-global-PDP card interpolates a <strong> into a translated
    // string, and react-intl returns an unkeyed array of chunks — React warns.
    // Not ours to fix.
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    setup({
      node: buildPageNode({ id: 'shoes', title: 'Shoes', type: 'category' }),
      initialView: 'pdp',
    });
    await screen.findAllByText('Shoes');

    // The PDP assignment card is shown instead of the category one.
    expect(
      (await screen.findAllByText('Product detail page')).length
    ).toBeGreaterThan(0);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('unique "key" prop'),
      expect.anything(),
      expect.anything()
    );
    error.mockRestore();
  });

  it('shows no view switch for a non-category page', async () => {
    setup();
    await screen.findAllByText('Homepage');
    expect(screen.queryByText('Product detail page')).not.toBeInTheDocument();
  });

  it('treats the category root as a category', async () => {
    setup({
      node: buildPageNode({
        id: 'cat-root',
        title: 'All categories',
        type: undefined,
      }),
    });
    await screen.findAllByText('All categories');
    expect(
      (await screen.findAllByText('Category page')).length
    ).toBeGreaterThan(0);
  });
});
