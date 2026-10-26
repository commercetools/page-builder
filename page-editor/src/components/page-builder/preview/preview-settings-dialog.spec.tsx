import PreviewSettingsDialog from './preview-settings-dialog';
import type { PreviewSettings } from '../types';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../../test-utils/render';
import { buildPreviewSettings } from '../../../test-utils/factories';

const setup = (
  over: Partial<Parameters<typeof PreviewSettingsDialog>[0]> = {}
) => {
  const onOpenChange = jest.fn();
  const onSave = jest.fn<Promise<void>, [PreviewSettings]>(
    async () => undefined
  );
  const rendered = renderWithProviders(
    <PreviewSettingsDialog
      isOpen
      onOpenChange={onOpenChange}
      settings={buildPreviewSettings()}
      saving={false}
      onSave={onSave}
      {...over}
    />
  );
  return { onOpenChange, onSave, ...rendered };
};

beforeEach(() => window.localStorage.clear());

describe('PreviewSettingsDialog', () => {
  it('renders nothing while closed', async () => {
    setup({ isOpen: false });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('opens with the existing settings loaded', async () => {
    setup({
      settings: buildPreviewSettings({
        environments: {
          production: { baseUrl: 'https://shop.test' },
          staging: { baseUrl: 'https://staging.test' },
        },
      }),
    });

    await screen.findByRole('dialog');
    expect(
      await screen.findByDisplayValue('https://shop.test')
    ).toBeInTheDocument();
  });

  it('opens on defaults when nothing is configured yet', async () => {
    setup({ settings: null });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('cancels without saving', async () => {
    const { user, onOpenChange, onSave } = setup();
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cannot save without a base URL anywhere', async () => {
    setup({
      settings: buildPreviewSettings({
        baseUrl: '',
        environments: {
          production: { baseUrl: '' },
          staging: { baseUrl: '' },
        },
      }),
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the edited settings', async () => {
    const { user, onSave } = setup({
      settings: buildPreviewSettings({
        environments: {
          production: { baseUrl: 'https://shop.test' },
          staging: { baseUrl: '' },
        },
      }),
    });

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const written = onSave.mock.calls[0][0] as PreviewSettings;
    expect(written.environments?.production.baseUrl).toBe('https://shop.test');
  });

  it('carries an edited base URL into the saved settings', async () => {
    const { user, onSave } = setup({
      settings: buildPreviewSettings({
        environments: {
          production: { baseUrl: 'https://shop.test' },
          staging: { baseUrl: '' },
        },
      }),
    });

    const field = await screen.findByDisplayValue('https://shop.test');
    await user.clear(field);
    await user.type(field, 'https://new.test');

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(
      (onSave.mock.calls[0][0] as PreviewSettings).environments?.production
        .baseUrl
    ).toBe('https://new.test');
  });

  it('disables its actions while saving', async () => {
    setup({ saving: true });
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' })
    ).toBeDisabled();
  });
});
