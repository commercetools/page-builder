import DataSourceConfigDialog from './data-source-config-dialog';
import type { SavedDataSource } from './types';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildDataSourceType,
  buildSchemaField,
  localized,
} from '../../test-utils/factories';

installMockServer();

const catalog = [
  buildDataSourceType({
    type: 'commerce/product-list',
    name: localized('Product list'),
    schema: [buildSchemaField({ key: 'limit', label: 'Limit', kind: 'text' })],
  }),
];

const saved = (over: Partial<SavedDataSource> = {}): SavedDataSource => ({
  id: 'ds-1',
  type: 'commerce/product-list',
  name: localized('Featured products'),
  config: { limit: '4' },
  savedForReuse: true,
  ...over,
});

/**
 * The dialog's config form renders the same unlabelled number/select/rich-text
 * controls as `FieldInput`, so React Aria warns about a missing accessible name.
 */
let unlabelledWarning: jest.SpyInstance;
beforeEach(() => {
  unlabelledWarning = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => unlabelledWarning.mockRestore());

const setup = (
  over: Partial<Parameters<typeof DataSourceConfigDialog>[0]> = {}
) => {
  const handlers = {
    onUse: jest.fn<void, [SavedDataSource]>(),
    onSave: jest.fn<Promise<void>, [SavedDataSource]>(async () => undefined),
    onPublish: jest.fn<Promise<void>, [SavedDataSource]>(async () => undefined),
    onClose: jest.fn(),
  };
  const rendered = renderWithProviders(
    <DataSourceConfigDialog
      open
      typeFilter="commerce/product-list"
      currentId={null}
      savedSources={[]}
      dataSourceCatalog={catalog}
      {...handlers}
      {...over}
    />
  );
  return { ...handlers, ...rendered };
};

describe('DataSourceConfigDialog for an unknown type', () => {
  it('says the type is not registered', async () => {
    setup({ typeFilter: 'nope/missing', dataSourceCatalog: [] });
    expect(await screen.findByText(/is registered/)).toBeInTheDocument();
    expect(screen.getByText('nope/missing')).toBeInTheDocument();
  });

  it('offers only a way out', async () => {
    const { user, onClose } = setup({
      typeFilter: 'nope/missing',
      dataSourceCatalog: [],
    });
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DataSourceConfigDialog tabs', () => {
  it('opens on Create new when nothing is saved yet', async () => {
    setup({ savedSources: [] });
    await screen.findByRole('dialog');

    const createTab = screen.getByRole('tab', { name: /Create new/ });
    expect(createTab).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on Use saved when a matching source exists', async () => {
    setup({ savedSources: [saved()] });
    await screen.findByRole('dialog');

    expect(screen.getByRole('tab', { name: /Use saved/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('switches between tabs', async () => {
    const { user } = setup({ savedSources: [saved()] });
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('tab', { name: /Create new/ }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Create new/ })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
  });

  it('offers no edit tab until an edit is started', async () => {
    setup({ savedSources: [saved()] });
    await screen.findByRole('dialog');
    expect(
      screen.queryByRole('tab', { name: /Edit configuration/ })
    ).not.toBeInTheDocument();
  });
});

describe('DataSourceConfigDialog using a saved source', () => {
  it('lists the saved sources that match the type', async () => {
    setup({ savedSources: [saved()] });
    expect(await screen.findByText('Featured products')).toBeInTheDocument();
  });

  it('hides saved sources of another type', async () => {
    setup({
      savedSources: [
        saved({ id: 'other', type: 'content/blog', name: localized('Blog') }),
      ],
    });
    await screen.findByRole('dialog');
    expect(screen.queryByText('Blog')).not.toBeInTheDocument();
  });

  it('binds the selected source', async () => {
    const source = saved();
    const { user, onUse } = setup({
      savedSources: [source],
      currentId: 'ds-1',
    });
    await screen.findByText('Featured products');

    const use = screen
      .getAllByRole('button')
      .find((b) => /^Use/.test(b.textContent ?? ''));
    await user.click(use!);

    expect(onUse).toHaveBeenCalledWith(source);
  });

  it('filters the saved list by search', async () => {
    const { user } = setup({
      savedSources: [
        saved(),
        saved({ id: 'ds-2', name: localized('Newest arrivals') }),
      ],
    });
    await screen.findByText('Featured products');

    const search = screen.getAllByRole('searchbox')[0];
    await user.type(search, 'Newest');

    await waitFor(() =>
      expect(screen.queryByText('Featured products')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Newest arrivals')).toBeInTheDocument();
  });
});

describe('DataSourceConfigDialog creating a source', () => {
  it('saves a new source and reports it', async () => {
    const { user, onSave } = setup({ savedSources: [] });
    await screen.findByRole('dialog');

    const nameField = screen.getAllByRole('textbox')[0];
    await user.type(nameField, 'My list');

    const save = screen
      .getAllByRole('button')
      .find((b) => /Save/.test(b.textContent ?? ''));
    await user.click(save!);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const written = onSave.mock.calls[0][0] as SavedDataSource;
    expect(written.type).toBe('commerce/product-list');
    expect(Object.values(written.name)).toContain('My list');
  });

  it('publishes a new source', async () => {
    const { user, onPublish } = setup({ savedSources: [] });
    await screen.findByRole('dialog');
    await user.type(screen.getAllByRole('textbox')[0], 'My list');

    const publish = screen
      .getAllByRole('button')
      .find((b) => /Publish/i.test(b.textContent ?? ''));
    expect(publish).toBeDefined();

    await user.click(publish!);
    await waitFor(() => expect(onPublish).toHaveBeenCalled());
  });
});

describe('DataSourceConfigDialog editing a source', () => {
  const startEditing = async (user: {
    click: (el: Element) => Promise<void>;
  }) => {
    const edit = screen
      .getAllByRole('button')
      .find((b) =>
        /edit/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')
      );
    await user.click(edit!);
    return screen.findByRole('tab', { name: /Edit configuration/ });
  };

  it('opens an edit tab seeded from the source', async () => {
    const { user } = setup({ savedSources: [saved()] });
    await screen.findByText('Featured products');

    await startEditing(user);
    expect(
      await screen.findByDisplayValue('Featured products')
    ).toBeInTheDocument();
  });

  it('saves the amended source under the same id', async () => {
    const { user, onSave } = setup({ savedSources: [saved()] });
    await screen.findByText('Featured products');
    await startEditing(user);

    const nameField = await screen.findByDisplayValue('Featured products');
    await user.type(nameField, ' v2');

    const save = screen
      .getAllByRole('button')
      .find((b) => /Save changes/.test(b.textContent ?? ''));
    await user.click(save!);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as SavedDataSource).id).toBe('ds-1');
  });

  it('saves a copy under a new id and a marked name', async () => {
    const { user, onSave } = setup({ savedSources: [saved()] });
    await screen.findByText('Featured products');
    await startEditing(user);
    await screen.findByDisplayValue('Featured products');

    const copy = screen
      .getAllByRole('button')
      .find((b) => /Save as copy/.test(b.textContent ?? ''));
    expect(copy).toBeDefined();

    await user.click(copy!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const written = onSave.mock.calls[0][0];
    expect(written.id).not.toBe('ds-1');
    expect(Object.values(written.name)[0]).toContain('(copy)');
  });
});

describe('DataSourceConfigDialog lifecycle', () => {
  it('renders nothing while closed', async () => {
    setup({ open: false, savedSources: [saved()] });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('closes when dismissed', async () => {
    const { user, onClose } = setup({ savedSources: [saved()] });
    const dialog = await screen.findByRole('dialog');

    const close = within(dialog)
      .getAllByRole('button')
      .find((b) =>
        /close/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')
      );
    await user.click(close!);
    expect(onClose).toHaveBeenCalled();
  });
});
