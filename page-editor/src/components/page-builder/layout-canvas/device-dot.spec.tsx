import DeviceDot, { DEVICE_ORDER } from './device-dot';
import { renderWithProviders, screen } from '../../../test-utils/render';

describe('DEVICE_ORDER', () => {
  it('fixes the dot order so position and device never drift apart', () => {
    expect(DEVICE_ORDER).toEqual(['mobile', 'tablet', 'desktop']);
  });
});

describe('DeviceDot', () => {
  const render = (show: boolean) =>
    renderWithProviders(
      <div data-testid="host">
        <DeviceDot show={show} />
      </div>
    );

  it('renders a dot whether visible or not', async () => {
    render(true);
    const host = await screen.findByTestId('host');
    expect(host.querySelector('span')).toBeInTheDocument();
  });

  it('distinguishes shown from hidden by colour', async () => {
    const shown = render(true);
    const shownColor = (await shown.findByTestId('host')).querySelector(
      'span'
    )!.className;

    shown.unmount();

    const hidden = render(false);
    const hiddenColor = (await hidden.findByTestId('host')).querySelector(
      'span'
    )!.className;

    expect(shownColor).not.toBe(hiddenColor);
  });
});
