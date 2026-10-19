import { LocalizedRichText } from './localized-rich-text';
import { renderWithProviders, screen } from '../../../../test-utils/render';

const setup = (over: Partial<Parameters<typeof LocalizedRichText>[0]> = {}) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <LocalizedRichText
      label="Body"
      value={{ 'en-US': '<p>Hello</p>' }}
      onChange={onChange}
      {...over}
    />,
    { project: { languages: ['en-US', 'de-DE'] } }
  );
  return { onChange, ...rendered };
};

describe('LocalizedRichText', () => {
  it('labels the field', async () => {
    setup();
    expect(await screen.findByText('Body')).toBeInTheDocument();
  });

  it('offers a tab per project locale', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'en-US' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'de-DE' })).toBeInTheDocument();
  });

  it('starts on the default locale', async () => {
    setup();
    const active = await screen.findByRole('button', { name: 'en-US' });
    const inactive = screen.getByRole('button', { name: 'de-DE' });
    expect(active.className).not.toBe(inactive.className);
  });

  it('switches the active locale', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'de-DE' }));

    const nowActive = screen.getByRole('button', { name: 'de-DE' });
    const nowInactive = screen.getByRole('button', { name: 'en-US' });
    expect(nowActive.className).not.toBe(nowInactive.className);
  });

  it('writes an empty paragraph into a locale merely by viewing its tab', async () => {
    // Current behaviour, not desired behaviour: RichTextInput normalizes an empty
    // document to `<p></p>` and reports it, so switching tabs marks the page
    // dirty without the user typing anything.
    const { user, onChange } = setup({ value: { 'en-US': '<p>Hello</p>' } });
    await user.click(await screen.findByRole('button', { name: 'de-DE' }));

    expect(onChange).toHaveBeenCalledWith({
      'en-US': '<p>Hello</p>',
      'de-DE': '<p></p>',
    });
  });

  it('shows the content of the active locale', async () => {
    setup({ value: { 'en-US': 'English copy', 'de-DE': 'Deutscher Text' } });
    expect(await screen.findByText('English copy')).toBeInTheDocument();
  });

  it('shows an empty editor for a locale with no content yet', async () => {
    const { user } = setup({ value: { 'en-US': 'English copy' } });
    await user.click(await screen.findByRole('button', { name: 'de-DE' }));
    expect(screen.queryByText('English copy')).not.toBeInTheDocument();
  });
});
