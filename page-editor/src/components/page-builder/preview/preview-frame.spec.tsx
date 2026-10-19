import PreviewFrame from './preview-frame';
import { renderWithProviders, screen } from '../../../test-utils/render';

const setup = (over: Partial<Parameters<typeof PreviewFrame>[0]> = {}) => {
  const handlers = {
    onLocaleChange: jest.fn(),
    onRefresh: jest.fn(),
    onConfigure: jest.fn(),
  };
  const rendered = renderWithProviders(
    <PreviewFrame
      url="https://shop.test/en-us"
      configured
      device="desktop"
      locales={['en-us', 'de-de']}
      locale="en-us"
      {...handlers}
      {...over}
    />
  );
  return { ...handlers, ...rendered };
};

describe('PreviewFrame when preview is not set up', () => {
  it('explains that preview needs configuring', async () => {
    setup({ configured: false });
    expect(
      await screen.findByText('Preview is not set up yet')
    ).toBeInTheDocument();
  });

  it('offers a way into the settings', async () => {
    const { user, onConfigure } = setup({ configured: false });
    await user.click(
      await screen.findByRole('button', { name: 'Configure preview' })
    );
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });

  it('shows no iframe', async () => {
    const { container } = setup({ configured: false });
    await screen.findByText('Preview is not set up yet');
    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('PreviewFrame with no URL for this page', () => {
  it('says so rather than showing a blank frame', async () => {
    setup({ url: null });
    expect(
      await screen.findByText('Cannot build a preview URL for this page')
    ).toBeInTheDocument();
  });
});

describe('PreviewFrame with a URL', () => {
  it('renders the host page in an iframe', async () => {
    const { container } = setup();
    await screen.findByTitle('Storefront preview');
    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://shop.test/en-us'
    );
  });

  it('offers a refresh', async () => {
    const { user, onRefresh } = setup();
    await screen.findByTitle('Storefront preview');

    const refresh = screen
      .getAllByRole('button')
      .find((b) =>
        /refresh/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')
      );
    await user.click(refresh!);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('narrows the frame per device', async () => {
    const desktop = setup({ device: 'desktop' });
    const desktopClass = (await desktop.findByTitle('Storefront preview'))
      .parentElement!.className;
    desktop.unmount();

    const mobile = setup({ device: 'mobile' });
    const mobileClass = (await mobile.findByTitle('Storefront preview'))
      .parentElement!.className;

    expect(mobileClass).not.toBe(desktopClass);
  });

  it('warns when the host loaded a different page than the editor asked for', async () => {
    setup({ idMismatch: true });
    await screen.findByTitle('Storefront preview');
    // A visible banner, not just a console warning.
    expect(
      screen.getByText('Preview is showing a different page')
    ).toBeInTheDocument();
  });

  it('shows no mismatch banner normally', async () => {
    setup();
    await screen.findByTitle('Storefront preview');
    expect(
      screen.queryByText('Preview is showing a different page')
    ).not.toBeInTheDocument();
  });
});
