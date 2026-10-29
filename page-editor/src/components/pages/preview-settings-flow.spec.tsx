import { Button, toast } from '@commercetools/nimbus';
import PreviewSettingsDialog from '../page-builder/preview/preview-settings-dialog';
import { usePreviewSettingsState } from './use-preview-settings-state';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';
import { buildPreviewSettings } from '../../test-utils/factories';

/**
 * The preview settings dialog wired to the dashboard's state hook, exactly as
 * `Pages` does: what a user sees when they edit, save, and come back.
 */
const store = installMockServer();

const Harness = () => {
  const { settings, loadError, saving, isOpen, setIsOpen, save } =
    usePreviewSettingsState();
  return (
    <>
      <Button onPress={() => setIsOpen(true)}>open-settings</Button>
      <PreviewSettingsDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        settings={settings}
        loadError={loadError}
        saving={saving}
        onSave={save}
      />
    </>
  );
};

const seedProduction = (baseUrl: string) =>
  store.seed({
    container: 'page-editor',
    key: 'settings',
    value: {
      schemaVersion: 2,
      preview: buildPreviewSettings({
        environments: {
          production: { baseUrl },
          staging: { baseUrl: '' },
        },
      }),
    },
  });

const storedProductionUrl = () =>
  (
    store.get('page-editor', 'settings')?.value as {
      preview: { environments: { production: { baseUrl: string } } };
    }
  ).preview.environments.production.baseUrl;

let toastSuccess: jest.SpyInstance;
let toastError: jest.SpyInstance;
beforeEach(() => {
  window.localStorage.clear();
  toastSuccess = jest.spyOn(toast, 'success').mockImplementation(() => '');
  toastError = jest.spyOn(toast, 'error').mockImplementation(() => '');
});
afterEach(() => {
  toastSuccess.mockRestore();
  toastError.mockRestore();
});

describe('editing the preview settings', () => {
  it('shows what was saved when the dialog is reopened', async () => {
    seedProduction('https://old.test');
    const { user } = renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'open-settings' }));
    let dialog = await screen.findByRole('dialog');
    const field = await within(dialog).findByDisplayValue('https://old.test');
    await user.clear(field);
    await user.type(field, 'https://new.test');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(storedProductionUrl()).toBe('https://new.test');
    expect(toastSuccess).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'open-settings' }));
    dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByDisplayValue('https://new.test')
    ).toBeInTheDocument();
  });

  it('discards edits that were cancelled when the dialog is reopened', async () => {
    seedProduction('https://old.test');
    const { user } = renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'open-settings' }));
    let dialog = await screen.findByRole('dialog');
    const field = await within(dialog).findByDisplayValue('https://old.test');
    await user.clear(field);
    await user.type(field, 'https://abandoned.test');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'open-settings' }));
    dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByDisplayValue('https://old.test')
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://abandoned.test')).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(storedProductionUrl()).toBe('https://old.test');
  });

  it('says so, and keeps the dialog and the edits, when the save fails', async () => {
    seedProduction('https://old.test');
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open-settings' }));
    const dialog = await screen.findByRole('dialog');
    const field = await within(dialog).findByDisplayValue('https://old.test');

    server.use(failOperation('UpsertPreviewSettings', 'nope', 'mutation'));
    await user.clear(field);
    await user.type(field, 'https://new.test');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Preview settings could not be saved.' })
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByDisplayValue('https://new.test')
    ).toBeInTheDocument();
    expect(storedProductionUrl()).toBe('https://old.test');
  });

  it('refuses to save over settings it could not read', async () => {
    seedProduction('https://old.test');
    server.use(failOperation('FetchPreviewSettings', 'nope'));
    const { user } = renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'open-settings' }));
    const dialog = await screen.findByRole('dialog');

    expect(
      await within(dialog).findByText(/could not be loaded/)
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
