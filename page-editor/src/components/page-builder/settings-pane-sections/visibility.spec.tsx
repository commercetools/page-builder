import { Accordion } from '@commercetools/nimbus';
import { SettingsVisibilitySection } from './visibility';
import { renderWithProviders, screen } from '../../../test-utils/render';
import {
  buildComponentElement,
  buildLayoutElement,
  visible,
} from '../../../test-utils/factories';

/**
 * `Accordion.Item` must live inside an `Accordion.Root`, and its panel is hidden
 * from the accessibility tree until expanded — so every test opens the section
 * first, the same way a user would.
 */
const setup = async (
  over: Partial<Parameters<typeof SettingsVisibilitySection>[0]> = {}
) => {
  const handleLayoutChange = jest.fn();
  const handleCompChange = jest.fn();
  const layout = buildLayoutElement({ visibility: visible() });
  const rendered = renderWithProviders(
    <Accordion.Root>
      <SettingsVisibilitySection
        element={layout}
        layout={layout}
        handleLayoutChange={handleLayoutChange}
        handleCompChange={handleCompChange}
        {...over}
      />
    </Accordion.Root>
  );
  await rendered.user.click(
    await screen.findByRole('button', { expanded: false })
  );
  return { layout, handleLayoutChange, handleCompChange, ...rendered };
};

describe('SettingsVisibilitySection', () => {
  it('offers a switch per device', async () => {
    await setup();
    expect(
      await screen.findByRole('switch', { name: /mobile/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /tablet/i })).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /desktop/i })
    ).toBeInTheDocument();
  });

  it('reflects the element visibility', async () => {
    const layout = buildLayoutElement({
      visibility: { mobile: false, tablet: true, desktop: true },
    });
    await setup({ element: layout, layout });

    expect(
      await screen.findByRole('switch', { name: /mobile/i })
    ).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /tablet/i })).toBeChecked();
  });

  it('updates the layout when no component is selected', async () => {
    const { user, layout, handleLayoutChange, handleCompChange } =
      await setup();
    await user.click(await screen.findByRole('switch', { name: /mobile/i }));

    expect(handleLayoutChange).toHaveBeenCalledWith({
      ...layout,
      visibility: { ...layout.visibility, mobile: false },
    });
    expect(handleCompChange).not.toHaveBeenCalled();
  });

  it('updates the component when one is selected', async () => {
    const selectedComp = buildComponentElement({ visibility: visible() });
    const layout = buildLayoutElement({ children: [selectedComp] });
    const { user, handleCompChange, handleLayoutChange } = await setup({
      element: selectedComp,
      layout,
      selectedComp,
    });

    await user.click(await screen.findByRole('switch', { name: /desktop/i }));

    expect(handleCompChange).toHaveBeenCalledWith({
      ...selectedComp,
      visibility: { ...selectedComp.visibility, desktop: false },
    });
    expect(handleLayoutChange).not.toHaveBeenCalled();
  });

  it('changes only the device that was toggled', async () => {
    const layout = buildLayoutElement({
      visibility: { mobile: true, tablet: false, desktop: true },
    });
    const { user, handleLayoutChange } = await setup({
      element: layout,
      layout,
    });

    await user.click(await screen.findByRole('switch', { name: /tablet/i }));
    expect(handleLayoutChange.mock.calls[0][0].visibility).toEqual({
      mobile: true,
      tablet: true,
      desktop: true,
    });
  });
});
