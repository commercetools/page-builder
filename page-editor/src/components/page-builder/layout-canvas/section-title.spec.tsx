import SectionTitle from './section-title';
import { renderWithProviders, screen } from '../../../test-utils/render';
import { buildSection, localized } from '../../../test-utils/factories';

const setup = (over: Partial<Parameters<typeof SectionTitle>[0]> = {}) => {
  const onToggle = jest.fn();
  const rendered = renderWithProviders(
    <SectionTitle
      section={buildSection({
        name: localized('Main'),
        description: localized('The primary content'),
      })}
      collapsed={false}
      onToggle={onToggle}
      {...over}
    />
  );
  return { onToggle, ...rendered };
};

describe('SectionTitle', () => {
  it('shows the section name in upper case, labelled as a section', async () => {
    setup();
    expect(await screen.findByText('MAIN SECTION')).toBeInTheDocument();
  });

  it('shows the section description', async () => {
    setup();
    expect(await screen.findByText('The primary content')).toBeInTheDocument();
  });

  it('toggles when clicked', async () => {
    const { user, onToggle } = setup();
    await user.click(await screen.findByText('MAIN SECTION'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows a different chevron depending on collapsed state', async () => {
    // The chevron is the trailing icon; its glyph changes between
    // ExpandMore and ExpandLess.
    const chevronPath = (container: HTMLElement) =>
      container.querySelector('span:last-of-type svg path')?.getAttribute('d');

    const open = setup({ collapsed: false });
    await open.findByText('MAIN SECTION');
    const openGlyph = chevronPath(open.container);
    open.unmount();

    const closed = setup({ collapsed: true });
    await closed.findByText('MAIN SECTION');

    expect(openGlyph).toBeTruthy();
    expect(chevronPath(closed.container)).not.toBe(openGlyph);
  });
});
