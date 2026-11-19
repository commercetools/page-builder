import { useState } from 'react';
import PreviewSettingsDialog from './preview-settings-dialog';
import type { PreviewSettings } from '../types';
import {
  act,
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

  describe('the Local environment, which is per-browser', () => {
    const LOCAL_KEY = 'pb:preview:local';

    const typeLocalUrl = async (
      user: ReturnType<typeof setup>['user'],
      url: string
    ) => {
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Local' }));
      await user.type(
        await within(dialog).findByPlaceholderText('http://localhost:3000'),
        url
      );
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    };

    it('is stored in this browser once the save succeeds', async () => {
      const { user, onSave } = setup();
      await typeLocalUrl(user, 'http://localhost:4000');

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem(LOCAL_KEY)!)).toEqual(
          expect.objectContaining({ baseUrl: 'http://localhost:4000' })
        )
      );
    });

    it('is left alone when the save fails, as the rest of the form is', async () => {
      const onSave = jest.fn().mockRejectedValue(new Error('nope'));
      const { user, onOpenChange } = setup({ onSave });
      await typeLocalUrl(user, 'http://localhost:4000');

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(window.localStorage.getItem(LOCAL_KEY)).toBeNull();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('when the settings change while it is open', () => {
    // The open modal makes everything outside it inaccessible, so the change is
    // pushed in through a captured setter rather than a button.
    let loadSettings!: () => void;
    const Refreshing = () => {
      const [settings, setSettings] = useState<PreviewSettings | null>(null);
      loadSettings = () =>
        setSettings(
          buildPreviewSettings({
            environments: {
              production: { baseUrl: 'https://loaded.test' },
              staging: { baseUrl: '' },
            },
          })
        );
      return (
        <PreviewSettingsDialog
          isOpen
          onOpenChange={jest.fn()}
          settings={settings}
          saving={false}
          onSave={async () => undefined}
        />
      );
    };

    it('fills in an untouched form when the saved settings arrive late', async () => {
      renderWithProviders(<Refreshing />);
      await screen.findByRole('dialog');
      expect(screen.queryByDisplayValue('https://loaded.test')).toBeNull();

      act(() => loadSettings());

      expect(
        await screen.findByDisplayValue('https://loaded.test')
      ).toBeInTheDocument();
    });

    it('does not replace what the user has already typed', async () => {
      const { user } = renderWithProviders(<Refreshing />);
      const dialog = await screen.findByRole('dialog');
      const [baseUrl] = within(dialog).getAllByPlaceholderText(
        'https://store.example.com'
      );
      await user.type(baseUrl, 'https://typed.test');

      act(() => loadSettings());

      expect(
        await screen.findByDisplayValue('https://typed.test')
      ).toBeInTheDocument();
      expect(screen.queryByDisplayValue('https://loaded.test')).toBeNull();
    });
  });
});
