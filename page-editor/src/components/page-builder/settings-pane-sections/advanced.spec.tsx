import { Accordion } from '@commercetools/nimbus';
import { SettingsAdvancedSection } from './advanced';
import {
  renderWithProviders,
  screen,
  within,
} from '../../../test-utils/render';

/** The panel is hidden until expanded, so open it the way a user would. */
const setup = async () => {
  const rendered = renderWithProviders(
    <Accordion.Root>
      <SettingsAdvancedSection />
    </Accordion.Root>
  );
  await rendered.user.click(
    await screen.findByRole('button', { expanded: false })
  );
  return rendered;
};

describe('SettingsAdvancedSection', () => {
  it('offers a CSS id field with guidance', async () => {
    await setup();
    expect(await screen.findByText(/css id/i)).toBeInTheDocument();
  });

  it('offers a market-permissions select', async () => {
    await setup();
    expect(await screen.findByText(/market permissions/i)).toBeInTheDocument();
  });

  it('lists the market options', async () => {
    const { user } = await setup();
    // The market select is the remaining collapsed trigger.
    await user.click(await screen.findByRole('button', { expanded: false }));

    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('All markets')).toBeInTheDocument();
    expect(within(list).getByText('United States only')).toBeInTheDocument();
    expect(within(list).getByText('European Union only')).toBeInTheDocument();
    expect(within(list).getByText('APAC only')).toBeInTheDocument();
  });

  it('renders both fields as not-yet-wired placeholders', async () => {
    // Neither control is bound to state — they are UI stubs. Recorded so a future
    // reader does not assume the CSS id is persisted anywhere.
    const { container } = await setup();
    await screen.findByText(/css id/i);
    expect(container.querySelector('input')).toHaveValue('');
  });
});
