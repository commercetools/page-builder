import StateTag from './state-tag';
import { renderWithProviders, screen } from '../../test-utils/render';

// `renderWithProviders` boots the application shell, which suspends. Every
// assertion therefore has to await the first paint — see test-utils/render.tsx.
const Harness = ({ state }: { state?: string }) => (
  <div data-testid="harness">
    <StateTag state={state} />
  </div>
);

describe('StateTag', () => {
  it('renders nothing without a state', async () => {
    renderWithProviders(<Harness />);
    expect(await screen.findByTestId('harness')).toBeEmptyDOMElement();
  });

  it('shows the state text', async () => {
    renderWithProviders(<Harness state="published" />);
    expect(await screen.findByText('published')).toBeInTheDocument();
  });

  it('renders a draft state too', async () => {
    renderWithProviders(<Harness state="draft" />);
    expect(await screen.findByText('draft')).toBeInTheDocument();
  });
});
