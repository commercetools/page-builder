import { LocaleTabs } from './locale-tabs';
import { renderWithProviders, screen } from '../../../../test-utils/render';

const setup = (over: Partial<Parameters<typeof LocaleTabs>[0]> = {}) => {
  const onSelect = jest.fn();
  const rendered = renderWithProviders(
    <LocaleTabs
      locales={['en-US', 'de-DE', 'fr-FR']}
      activeLocale="en-US"
      onSelect={onSelect}
      {...over}
    />
  );
  return { onSelect, ...rendered };
};

describe('LocaleTabs', () => {
  it('offers a tab per locale', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'en-US' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'de-DE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'fr-FR' })).toBeInTheDocument();
  });

  it('styles the active locale differently from the rest', async () => {
    setup();
    const active = await screen.findByRole('button', { name: 'en-US' });
    const inactive = screen.getByRole('button', { name: 'de-DE' });
    expect(active.className).not.toBe(inactive.className);
  });

  it('reports the locale that was chosen', async () => {
    const { user, onSelect } = setup();
    await user.click(await screen.findByRole('button', { name: 'de-DE' }));
    expect(onSelect).toHaveBeenCalledWith('de-DE');
  });

  it('still reports a click on the already-active locale', async () => {
    const { user, onSelect } = setup();
    await user.click(await screen.findByRole('button', { name: 'en-US' }));
    expect(onSelect).toHaveBeenCalledWith('en-US');
  });

  it('renders nothing for an empty locale list', async () => {
    const { container } = setup({ locales: [] });
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
