import { DataSourceSlot } from './data-source-slot';
import { renderWithProviders, screen } from '../../../test-utils/render';
import {
  buildDataSourceType,
  buildSavedDataSource,
  localized,
} from '../../../test-utils/factories';

const catalog = [
  buildDataSourceType({
    type: 'commerce/product-list',
    name: localized('Product list'),
    icon: 'ShoppingBag',
  }),
];

const setup = (over: Partial<Parameters<typeof DataSourceSlot>[0]> = {}) => {
  const onConfigure = jest.fn();
  const onClear = jest.fn();
  const rendered = renderWithProviders(
    <DataSourceSlot
      dsType="commerce/product-list"
      dsId={null}
      savedDataSources={[]}
      dataSourceCatalog={catalog}
      instancesDirty={false}
      onConfigure={onConfigure}
      onClear={onClear}
      {...over}
    />
  );
  return { onConfigure, onClear, ...rendered };
};

const bound = (over = {}) =>
  buildSavedDataSource({
    id: 'ds-1',
    type: 'commerce/product-list',
    name: localized('Featured products'),
    config: { limit: 4 },
    ...over,
  });

describe('DataSourceSlot when nothing is bound', () => {
  it('invites the author to configure a source', async () => {
    setup();
    expect(await screen.findByText(/configure/i)).toBeInTheDocument();
  });

  it('names the data-source type from the catalog', async () => {
    setup();
    expect(await screen.findByText('Product list')).toBeInTheDocument();
  });

  it('falls back to the raw type when the catalog has no entry', async () => {
    setup({ dsType: 'unknown/thing', dataSourceCatalog: [] });
    expect(await screen.findByText('unknown/thing')).toBeInTheDocument();
  });

  it('opens the configure dialog when pressed', async () => {
    const { user, onConfigure } = setup();
    await user.click(await screen.findByRole('button'));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });

  it('treats an id with no matching saved source as unbound', async () => {
    setup({ dsId: 'ds-gone', savedDataSources: [] });
    expect(await screen.findByText(/configure/i)).toBeInTheDocument();
  });
});

describe('DataSourceSlot when a source is bound', () => {
  const boundSetup = (over = {}) =>
    setup({ dsId: 'ds-1', savedDataSources: [bound(over)] });

  it('names the bound source and its type', async () => {
    boundSetup();
    expect(await screen.findByText('Featured products')).toBeInTheDocument();
    expect(screen.getByText('Product list')).toBeInTheDocument();
  });

  it('summarizes the binding config', async () => {
    boundSetup();
    expect(await screen.findByText('limit: 4')).toBeInTheDocument();
  });

  it('offers edit and clear', async () => {
    boundSetup();
    expect(
      await screen.findByRole('button', { name: /edit/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('re-opens the dialog from edit', async () => {
    const { user, onConfigure } = boundSetup();
    await user.click(await screen.findByRole('button', { name: /edit/i }));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });

  it('clears the binding', async () => {
    const { user, onClear } = boundSetup();
    await user.click(await screen.findByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('marks a reusable source as published', async () => {
    boundSetup({ savedForReuse: true });
    expect(await screen.findByText(/published/i)).toBeInTheDocument();
  });

  it('warns when a reusable source has unpublished edits', async () => {
    setup({
      dsId: 'ds-1',
      savedDataSources: [bound({ savedForReuse: true })],
      instancesDirty: true,
    });
    expect(await screen.findByText(/unpublished/i)).toBeInTheDocument();
  });

  it('shows no publish badge for a one-off source', async () => {
    boundSetup({ savedForReuse: false });
    await screen.findByText('Featured products');
    expect(screen.queryByText(/published/i)).not.toBeInTheDocument();
  });

  it('says the config is default when nothing is set', async () => {
    boundSetup({ config: {} });
    expect(await screen.findByText('Default config')).toBeInTheDocument();
  });
});
