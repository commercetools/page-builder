import SettingsPane from './settings-pane';
import type { Page } from './types';
import { renderWithProviders, screen, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildComponentElement,
  buildComponentType,
  buildDataSourceType,
  buildLayoutElement,
  buildSchemaField,
  localized,
} from '../../test-utils/factories';

installMockServer();

const page = (): Page => ({
  MAIN: [
    buildLayoutElement({
      id: 'layout-1',
      name: localized('Hero row'),
      children: [
        buildComponentElement({
          id: 'c1',
          type: 'content/hero',
          name: localized('Banner'),
          settings: { title: 'Welcome' },
        }),
      ],
    }),
  ],
});

const setup = (over: Partial<Parameters<typeof SettingsPane>[0]> = {}) => {
  const handlers = {
    onPageChange: jest.fn(),
    onClose: jest.fn(),
    onSaveDataSources: jest.fn(async () => undefined),
    onPublishDataSources: jest.fn(async () => undefined),
  };
  const rendered = renderWithProviders(
    <SettingsPane
      page={page()}
      selectedLayoutId={null}
      selectedCompId={null}
      savedDataSources={[]}
      instancesSaving={false}
      instancesDirty={false}
      componentCatalog={[
        buildComponentType({
          type: 'content/hero',
          schema: [buildSchemaField({ key: 'title', label: 'Headline' })],
        }),
      ]}
      dataSourceCatalog={[buildDataSourceType()]}
      {...handlers}
      {...over}
    />
  );
  return { ...handlers, ...rendered };
};

describe('SettingsPane with nothing selected', () => {
  it('invites the author to select something', async () => {
    setup();
    expect(await screen.findByText('Nothing selected')).toBeInTheDocument();
  });

  it('still titles the pane', async () => {
    setup();
    expect(await screen.findByText('Component settings')).toBeInTheDocument();
  });
});

describe('SettingsPane with a layout selected', () => {
  it('names the selected layout', async () => {
    setup({ selectedLayoutId: 'layout-1' });
    expect(await screen.findByText('Hero row')).toBeInTheDocument();
  });

  it('closes when asked', async () => {
    const { user, onClose } = setup({ selectedLayoutId: 'layout-1' });
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers the general and visibility sections', async () => {
    setup({ selectedLayoutId: 'layout-1' });
    await screen.findByText('Hero row');
    expect(screen.getByText('General settings')).toBeInTheDocument();
    expect(screen.getByText('Visibility')).toBeInTheDocument();
  });

  it('offers no content section for a layout', async () => {
    setup({ selectedLayoutId: 'layout-1' });
    await screen.findByText('Hero row');
    expect(screen.queryByText('Content fields')).not.toBeInTheDocument();
  });

  it('renders nothing for a layout id that is not on the page', async () => {
    // Guards against a stale `?layout=` in the URL rendering a broken pane.
    setup({ selectedLayoutId: 'ghost' });
    await waitFor(() =>
      expect(screen.queryByText('Component settings')).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Hero row')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing selected')).not.toBeInTheDocument();
  });
});

describe('SettingsPane with a component selected', () => {
  const selected = { selectedLayoutId: 'layout-1', selectedCompId: 'c1' };

  it('names the selected component', async () => {
    setup(selected);
    expect(await screen.findByText('Banner')).toBeInTheDocument();
  });

  it('offers the content section for a component with a schema', async () => {
    setup(selected);
    await screen.findByText('Banner');
    expect(screen.getByText('Content fields')).toBeInTheDocument();
  });

  it('opens on the content section, where the author is going anyway', async () => {
    setup(selected);
    await screen.findByText('Banner');
    // Content is expanded by default when there are fields to edit.
    expect(await screen.findByDisplayValue('Welcome')).toBeInTheDocument();
  });

  it('opens on general when the component has no fields', async () => {
    setup({
      ...selected,
      componentCatalog: [
        buildComponentType({ type: 'content/hero', schema: [] }),
      ],
    });
    await screen.findByText('Banner');
    expect(screen.queryByText('Content fields')).not.toBeInTheDocument();
  });

  it('offers no content section for a type missing from the catalog', async () => {
    setup({ ...selected, componentCatalog: [] });
    await screen.findByText('Banner');
    expect(screen.queryByText('Content fields')).not.toBeInTheDocument();
  });

  it('reports a settings edit as a page change', async () => {
    const { user, onPageChange } = setup(selected);
    await user.type(await screen.findByDisplayValue('Welcome'), '!');

    await waitFor(() => expect(onPageChange).toHaveBeenCalled());
    const next = onPageChange.mock.calls.at(-1)![0] as Page;
    expect(next.MAIN[0].children[0].settings.title).toBe('Welcome!');
  });

  it('reports a visibility change as a page change on the component', async () => {
    const { user, onPageChange } = setup(selected);
    await screen.findByText('Banner');

    await user.click(screen.getByText('Visibility'));
    await user.click(await screen.findByRole('switch', { name: /mobile/i }));

    const next = onPageChange.mock.calls.at(-1)![0] as Page;
    expect(next.MAIN[0].children[0].visibility.mobile).toBe(false);
  });
});
