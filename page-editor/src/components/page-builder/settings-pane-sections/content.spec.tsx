import { Accordion } from '@commercetools/nimbus';
import { SettingsContentSection } from './content';
import { renderWithProviders, screen } from '../../../test-utils/render';
import {
  buildComponentElement,
  buildComponentType,
  buildDataSourceType,
  buildSavedDataSource,
  buildSchemaField,
  localized,
} from '../../../test-utils/factories';

const setup = async (
  over: Partial<Parameters<typeof SettingsContentSection>[0]> = {}
) => {
  const openDsDialog = jest.fn();
  const handleCompChange = jest.fn();
  const selectedComp = buildComponentElement({
    id: 'c1',
    settings: { title: 'Welcome' },
  });
  const rendered = renderWithProviders(
    <Accordion.Root>
      <SettingsContentSection
        selectedComp={selectedComp}
        compDef={buildComponentType({
          schema: [buildSchemaField({ key: 'title', label: 'Headline' })],
        })}
        dataSourceCatalog={[buildDataSourceType()]}
        savedDataSources={[]}
        instancesDirty={false}
        openDsDialog={openDsDialog}
        handleCompChange={handleCompChange}
        {...over}
      />
    </Accordion.Root>
  );
  await rendered.user.click(
    await screen.findByRole('button', { expanded: false })
  );
  return { selectedComp, openDsDialog, handleCompChange, ...rendered };
};

describe('SettingsContentSection', () => {
  it('renders an editor per schema field', async () => {
    await setup({
      compDef: buildComponentType({
        schema: [
          buildSchemaField({ key: 'title', label: 'Headline' }),
          buildSchemaField({ key: 'subtitle', label: 'Subheading' }),
        ],
      }),
    });

    expect(await screen.findByText('Headline')).toBeInTheDocument();
    expect(screen.getByText('Subheading')).toBeInTheDocument();
  });

  it('shows the current setting value', async () => {
    await setup();
    expect(await screen.findByDisplayValue('Welcome')).toBeInTheDocument();
  });

  it('reports an edit as a settings patch, leaving other settings alone', async () => {
    const selectedComp = buildComponentElement({
      id: 'c1',
      settings: { title: 'Welcome', other: 'keep me' },
    });
    const { user, handleCompChange } = await setup({ selectedComp });

    await user.type(await screen.findByDisplayValue('Welcome'), '!');

    expect(handleCompChange).toHaveBeenLastCalledWith({
      ...selectedComp,
      settings: { title: 'Welcome!', other: 'keep me' },
    });
  });

  it('renders nothing for a component with an empty schema', async () => {
    await setup({ compDef: buildComponentType({ schema: [] }) });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a group field as a repeatable list', async () => {
    await setup({
      compDef: buildComponentType({
        schema: [
          buildSchemaField({
            key: 'slides',
            label: 'Slides',
            kind: 'group',
            children: [buildSchemaField({ key: 'caption', label: 'Caption' })],
          }),
        ],
      }),
      selectedComp: buildComponentElement({
        id: 'c1',
        settings: { slides: [] },
      }),
    });

    expect(
      await screen.findByRole('button', { name: /add item/i })
    ).toBeInTheDocument();
  });

  it('renders a data-source field as a binding slot', async () => {
    await setup({
      compDef: buildComponentType({
        schema: [
          buildSchemaField({
            key: 'products',
            label: 'Products',
            kind: 'dataSource',
            dataSourceType: 'commerce/product-list',
          }),
        ],
      }),
      selectedComp: buildComponentElement({ id: 'c1', settings: {} }),
    });

    expect(await screen.findByText('Products')).toBeInTheDocument();
    // The slot renders as a single press-to-configure button.
    expect(
      await screen.findByRole('button', { name: /configure/i })
    ).toBeInTheDocument();
  });

  it('opens the data-source dialog with the field type and current binding', async () => {
    const { user, openDsDialog } = await setup({
      compDef: buildComponentType({
        schema: [
          buildSchemaField({
            key: 'products',
            label: 'Products',
            kind: 'dataSource',
            dataSourceType: 'commerce/product-list',
          }),
        ],
      }),
      selectedComp: buildComponentElement({
        id: 'c1',
        settings: { products: 'ds-1' },
      }),
      savedDataSources: [
        buildSavedDataSource({ id: 'ds-1', name: localized('Featured') }),
      ],
    });

    await user.click(await screen.findByRole('button', { name: /edit/i }));

    expect(openDsDialog).toHaveBeenCalledWith(
      'commerce/product-list',
      'ds-1',
      expect.any(Function)
    );
  });

  it('applies the id the dialog reports back', async () => {
    const { user, openDsDialog, handleCompChange, selectedComp } = await setup({
      compDef: buildComponentType({
        schema: [
          buildSchemaField({
            key: 'products',
            label: 'Products',
            kind: 'dataSource',
            dataSourceType: 'commerce/product-list',
          }),
        ],
      }),
      selectedComp: buildComponentElement({ id: 'c1', settings: {} }),
    });

    await user.click(await screen.findByRole('button', { name: /configure/i }));
    const applyId = openDsDialog.mock.calls[0][2] as (
      id: string | null
    ) => void;
    applyId('ds-new');

    expect(handleCompChange).toHaveBeenCalledWith({
      ...selectedComp,
      settings: { products: 'ds-new' },
    });
  });

  it('clears the binding to null', async () => {
    const { user, handleCompChange } = await setup({
      compDef: buildComponentType({
        schema: [
          buildSchemaField({
            key: 'products',
            label: 'Products',
            kind: 'dataSource',
            dataSourceType: 'commerce/product-list',
          }),
        ],
      }),
      selectedComp: buildComponentElement({
        id: 'c1',
        settings: { products: 'ds-1' },
      }),
      savedDataSources: [buildSavedDataSource({ id: 'ds-1' })],
    });

    await user.click(await screen.findByRole('button', { name: /clear/i }));
    expect(handleCompChange.mock.calls[0][0].settings.products).toBeNull();
  });

  it('tolerates a data-source field with no declared type', async () => {
    const { user, openDsDialog } = await setup({
      compDef: buildComponentType({
        schema: [
          buildSchemaField({
            key: 'products',
            label: 'Products',
            kind: 'dataSource',
          }),
        ],
      }),
      selectedComp: buildComponentElement({ id: 'c1', settings: {} }),
    });

    await user.click(await screen.findByRole('button', { name: /configure/i }));
    expect(openDsDialog).toHaveBeenCalledWith('', null, expect.any(Function));
  });
});
