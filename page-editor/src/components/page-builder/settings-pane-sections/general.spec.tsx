import { Accordion } from '@commercetools/nimbus';
import { SettingsGeneralSection } from './general';
import {
  renderWithProviders,
  screen,
  within,
} from '../../../test-utils/render';
import {
  buildComponentElement,
  buildLayoutElement,
  localized,
} from '../../../test-utils/factories';

/** The panel is hidden until expanded, so open it the way a user would. */
const setup = async (
  over: Partial<Parameters<typeof SettingsGeneralSection>[0]> = {}
) => {
  const handlers = {
    handleNameChange: jest.fn(),
    handleLayoutChange: jest.fn(),
    handleCompChange: jest.fn(),
  };
  const layout = buildLayoutElement({
    name: localized('Hero row'),
    width: '1/2',
  });
  const rendered = renderWithProviders(
    <Accordion.Root>
      <SettingsGeneralSection
        isLayout
        element={layout}
        layout={layout}
        normalizedName={localized('Hero row')}
        defaultLocale="en-US"
        {...handlers}
        {...over}
      />
    </Accordion.Root>
  );
  await rendered.user.click(
    await screen.findByRole('button', { expanded: false })
  );
  return { layout, ...handlers, ...rendered };
};

/** The nth collapsed select trigger inside the expanded panel. */
const selectTriggers = () => screen.getAllByRole('button', { expanded: false });

describe('SettingsGeneralSection name', () => {
  it('shows the element name for the default locale', async () => {
    await setup();
    expect(await screen.findByDisplayValue('Hero row')).toBeInTheDocument();
  });

  it('reports a name edit with its locale', async () => {
    const { user, handleNameChange } = await setup();
    await user.type(await screen.findByDisplayValue('Hero row'), '!');
    expect(handleNameChange).toHaveBeenLastCalledWith('en-US', 'Hero row!');
  });
});

describe('SettingsGeneralSection width', () => {
  it('offers a width select for a layout', async () => {
    await setup({ isLayout: true });
    expect(await screen.findByText('Layout element width')).toBeInTheDocument();
  });

  it('hides the width select for a component', async () => {
    const comp = buildComponentElement();
    await setup({ isLayout: false, element: comp, selectedComp: comp });
    expect(screen.queryByText('Layout element width')).not.toBeInTheDocument();
  });

  it('lists every width option', async () => {
    const { user } = await setup();
    await user.click(selectTriggers()[0]);

    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('Full width (1/1)')).toBeInTheDocument();
    expect(within(list).getByText('Half (1/2)')).toBeInTheDocument();
    expect(within(list).getByText('Three quarters (3/4)')).toBeInTheDocument();
  });

  it('reports the chosen width on the layout', async () => {
    const { user, layout, handleLayoutChange } = await setup();
    await user.click(selectTriggers()[0]);
    await user.click(
      within(await screen.findByRole('listbox')).getByText('Third (1/3)')
    );

    expect(handleLayoutChange).toHaveBeenCalledWith({
      ...layout,
      width: '1/3',
    });
  });
});

describe('SettingsGeneralSection style', () => {
  it('lists every element style', async () => {
    const { user } = await setup();
    // Style is the second select when the width select is present.
    await user.click(selectTriggers()[1]);

    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('Inherit from page')).toBeInTheDocument();
    expect(within(list).getByText('Dark')).toBeInTheDocument();
    expect(within(list).getByText('Sage')).toBeInTheDocument();
  });

  it('applies the style to the layout when no component is selected', async () => {
    const { user, layout, handleLayoutChange, handleCompChange } =
      await setup();
    await user.click(selectTriggers()[1]);
    await user.click(
      within(await screen.findByRole('listbox')).getByText('Dark')
    );

    expect(handleLayoutChange).toHaveBeenCalledWith({
      ...layout,
      style: 'dark',
    });
    expect(handleCompChange).not.toHaveBeenCalled();
  });

  it('applies the style to the component when one is selected', async () => {
    const selectedComp = buildComponentElement();
    const { user, handleCompChange, handleLayoutChange } = await setup({
      isLayout: false,
      element: selectedComp,
      selectedComp,
    });
    // No width select for a component, so style is the only one.
    await user.click(selectTriggers()[0]);
    await user.click(
      within(await screen.findByRole('listbox')).getByText('Dark')
    );

    expect(handleCompChange).toHaveBeenCalledWith({
      ...selectedComp,
      style: 'dark',
    });
    expect(handleLayoutChange).not.toHaveBeenCalled();
  });

  it('falls back to the English style label for an unknown locale', async () => {
    const { user } = await setup({ defaultLocale: 'ja-JP' });
    await user.click(selectTriggers()[1]);
    expect(
      within(await screen.findByRole('listbox')).getByText('Dark')
    ).toBeInTheDocument();
  });
});
