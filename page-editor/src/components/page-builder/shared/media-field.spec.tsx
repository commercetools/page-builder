import { fireEvent } from '@testing-library/react';
import MediaField from './media-field';
import { pickFile } from './pick-file';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../../test-utils/render';
import { installMockServer } from '../../../test-utils/msw';
import {
  createFakeMediaService,
  type FakeMediaService,
  type SeedFile,
} from '../../../test-utils/media-service';
import { setServiceRequestForTests } from '../../../service/transport';

jest.mock('./pick-file');

installMockServer();

const ENVIRONMENT = { pageBuilderServiceUrl: 'https://service.test/service' };
const STORED_URL =
  'https://storage.googleapis.com/b/page-builder/media/images/8299999999999-abcd1234-Hero.png';

const png = (name = 'hero.png') =>
  new File(['png'], name, { type: 'image/png' });

function setup({
  value = '',
  kind,
  seed = [],
  pageSize,
  configured = true,
  fake = createFakeMediaService(seed, { pageSize }),
}: {
  value?: unknown;
  kind?: 'image' | 'video';
  seed?: SeedFile[];
  pageSize?: number;
  configured?: boolean;
  fake?: FakeMediaService;
} = {}) {
  setServiceRequestForTests(fake.request);
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <MediaField value={value} onChange={onChange} kind={kind} />,
    { environment: (configured ? ENVIRONMENT : {}) as never }
  );
  return { fake, onChange, ...rendered };
}

const dialog = () => screen.findByRole('dialog');

describe('MediaField without a service URL', () => {
  it('says how to set uploads up, and offers nothing to press', async () => {
    setup({ configured: false });
    expect(
      await screen.findByText(/PAGE_BUILDER_SERVICE_URL/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('MediaField with nothing chosen', () => {
  it('offers to select an image, or a video for a video field', async () => {
    const image = setup();
    expect(await screen.findByText('Nothing selected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select image' })
    ).toBeInTheDocument();
    image.unmount();

    setup({ kind: 'video' });
    expect(
      await screen.findByRole('button', { name: 'Select video' })
    ).toBeInTheDocument();
  });

  it('does not offer to remove or replace what is not there', async () => {
    setup();
    await screen.findByRole('button', { name: 'Select image' });
    expect(
      screen.queryByRole('button', { name: 'Remove' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Replace' })
    ).not.toBeInTheDocument();
  });

  it('does not touch the service until the picker is opened', async () => {
    const { fake } = setup({ seed: [{ name: 'a.png' }] });
    await screen.findByRole('button', { name: 'Select image' });
    expect(fake.calls).toEqual([]);
  });
});

describe('MediaField with a file chosen', () => {
  it('previews an image under its readable name', async () => {
    setup({ value: STORED_URL });
    expect(await screen.findByText('Hero.png')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hero.png' })).toHaveAttribute(
      'src',
      STORED_URL
    );
  });

  it('falls back to an icon when the picture cannot be loaded, and tries again for the next file', async () => {
    const { rerender, onChange } = setup({ value: STORED_URL });
    fireEvent.error(await screen.findByRole('img', { name: 'Hero.png' }));
    await waitFor(() =>
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Hero.png')).toBeInTheDocument();

    const other = STORED_URL.replace('Hero', 'Other');
    rerender(<MediaField value={other} onChange={onChange} />);
    expect(
      await screen.findByRole('img', { name: 'Other.png' })
    ).toBeInTheDocument();
  });

  it('names a video without trying to show it as a picture', async () => {
    setup({
      value:
        'https://storage.googleapis.com/b/page-builder/media/videos/8299999999998-abcd1234-Clip.mp4',
      kind: 'video',
    });
    expect(await screen.findByText('Clip.mp4')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps showing a URL that was typed into an older page', async () => {
    setup({ value: 'https://cdn.example.com/banners/summer.jpg?w=800' });
    expect(await screen.findByText('summer.jpg')).toBeInTheDocument();
  });

  it('still says something is selected when the URL has no file name to show', async () => {
    const image = setup({ value: 'data:image/png;base64,AAAA' });
    expect(await screen.findByText('Image selected')).toBeInTheDocument();
    expect(screen.queryByText('Nothing selected')).not.toBeInTheDocument();
    image.unmount();

    setup({ value: 'https://cdn.example.com/', kind: 'video' });
    expect(await screen.findByText('Video selected')).toBeInTheDocument();
  });

  it('clears the value on Remove', async () => {
    const { user, onChange } = setup({ value: STORED_URL });
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('treats a value that is not a string as nothing chosen', async () => {
    setup({ value: { not: 'a url' } });
    expect(await screen.findByText('Nothing selected')).toBeInTheDocument();
  });
});

describe('MediaField picking an uploaded file', () => {
  const seed = [{ name: '9-aa-Alpha.png' }, { name: '8-bb-Beta.png' }];

  it('opens the picker and lists what was uploaded before', async () => {
    const { user, fake } = setup({ seed });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );

    const d = await dialog();
    expect(within(d).getByText('Select an image')).toBeInTheDocument();
    expect(
      await within(d).findByRole('button', { name: '9-aa-Alpha.png' })
    ).toBeInTheDocument();
    expect(
      within(d).getByRole('button', { name: '8-bb-Beta.png' })
    ).toBeInTheDocument();
    expect(fake.calls).toEqual(['GET image']);
  });

  it('shows the readable name of a stored file, not its sort key', async () => {
    const { user } = setup({
      seed: [{ name: '8299999999999-abcd1234-Hero-Banner.png' }],
    });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    expect(
      await screen.findByRole('button', { name: 'Hero-Banner.png' })
    ).toBeInTheDocument();
  });

  it('selects on Select, using the stored URL, and closes', async () => {
    const { user, onChange } = setup({ seed });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    const d = await dialog();

    const select = within(d).getByRole('button', { name: 'Select' });
    expect(select).toBeDisabled();

    const beta = await within(d).findByRole('button', {
      name: '8-bb-Beta.png',
    });
    await user.click(beta);
    expect(beta).toHaveAttribute('aria-pressed', 'true');
    expect(select).toBeEnabled();

    await user.click(select);
    expect(onChange).toHaveBeenCalledWith('https://storage.test/8-bb-Beta.png');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('takes a file on a double click', async () => {
    const { user, onChange } = setup({ seed });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    await user.dblClick(
      await screen.findByRole('button', { name: '9-aa-Alpha.png' })
    );
    expect(onChange).toHaveBeenCalledWith(
      'https://storage.test/9-aa-Alpha.png'
    );
  });

  it('keeps one file selected at a time', async () => {
    const { user } = setup({ seed });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    const alpha = await screen.findByRole('button', { name: '9-aa-Alpha.png' });
    const beta = screen.getByRole('button', { name: '8-bb-Beta.png' });
    await user.click(alpha);
    await user.click(beta);
    expect(alpha).toHaveAttribute('aria-pressed', 'false');
    expect(beta).toHaveAttribute('aria-pressed', 'true');
  });

  it('forgets the selection when the picker is dismissed', async () => {
    const { user, onChange } = setup({ seed });
    const open = await screen.findByRole('button', { name: 'Select image' });
    await user.click(open);
    await user.click(
      await screen.findByRole('button', { name: '9-aa-Alpha.png' })
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    await user.click(open);
    expect(
      await screen.findByRole('button', { name: 'Select' })
    ).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pages through a long library on request', async () => {
    const many = Array.from({ length: 3 }, (_, i) => ({
      name: `${i + 1}-aa-f${i + 1}.png`,
    }));
    const { user } = setup({ seed: many, pageSize: 2 });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    await screen.findByRole('button', { name: '1-aa-f1.png' });
    expect(
      screen.queryByRole('button', { name: '3-aa-f3.png' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(
      await screen.findByRole('button', { name: '3-aa-f3.png' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load more' })
    ).not.toBeInTheDocument();
  });

  it('says so when nothing has been uploaded', async () => {
    const { user } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    expect(
      await screen.findByText('Nothing has been uploaded yet.')
    ).toBeInTheDocument();
  });

  it('lists videos for a video field, as icons rather than pictures', async () => {
    const { user, fake } = setup({
      kind: 'video',
      seed: [
        { name: '8299999999998-abcd1234-Clip.mp4', kind: 'video' },
        { name: '8299999999997-abcd1234-Pic.png' },
      ],
    });
    await user.click(
      await screen.findByRole('button', { name: 'Select video' })
    );

    const d = await dialog();
    expect(within(d).getByText('Select a video')).toBeInTheDocument();
    expect(
      await within(d).findByRole('button', { name: 'Clip.mp4' })
    ).toBeInTheDocument();
    expect(
      within(d).queryByRole('button', { name: 'Pic.png' })
    ).not.toBeInTheDocument();
    expect(within(d).queryByRole('img')).not.toBeInTheDocument();
    expect(fake.calls).toEqual(['GET video']);
  });

  it('explains a service with no bucket instead of showing an empty library', async () => {
    const fake = createFakeMediaService();
    fake.refuse({ status: 501, code: 'media_not_configured' });
    const { user } = setup({ fake });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    expect(await screen.findByText(/PB_MEDIA_BUCKET/)).toBeInTheDocument();
    expect(
      screen.queryByText('Nothing has been uploaded yet.')
    ).not.toBeInTheDocument();
    // Nowhere to upload to, so nothing offers to.
    expect(
      screen.queryByRole('button', { name: 'Choose a file' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Upload a file' })
    ).not.toBeInTheDocument();
  });

  it('reports a storage outage in words', async () => {
    const fake = createFakeMediaService();
    fake.refuse({ status: 502, code: 'storage_unavailable' });
    const { user } = setup({ fake });
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Media storage is unavailable'
    );
    expect(
      screen.queryByText('Nothing has been uploaded yet.')
    ).not.toBeInTheDocument();
  });
});

describe('MediaField uploading', () => {
  const choose = (file: File | null) =>
    (pickFile as jest.Mock).mockResolvedValue(file);

  it('uploads the chosen file and selects it without a further step', async () => {
    const { user, fake, onChange } = setup();
    choose(png('hero.png'));
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Choose a file' })
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        'https://storage.test/stored/hero.png'
      )
    );
    expect(fake.calls).toContain('POST hero.png');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('asks the chooser only for the types the field takes', async () => {
    const { user } = setup({ kind: 'video' });
    choose(null);
    await user.click(
      await screen.findByRole('button', { name: 'Select video' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Choose a file' })
    );
    expect(pickFile).toHaveBeenCalledWith('video/mp4,video/webm');
  });

  it('does nothing when the chooser is dismissed', async () => {
    const { user, fake, onChange } = setup();
    choose(null);
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Choose a file' })
    );
    await screen.findByText('Nothing has been uploaded yet.');
    expect(fake.calls).toEqual(['GET image']);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uploads a file dropped on the zone', async () => {
    const { user, onChange } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    const zone = await screen.findByRole('group', { name: 'Upload a file' });

    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [png('dropped.png')] } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        'https://storage.test/stored/dropped.png'
      )
    );
  });

  it('turns away a file of the wrong kind without sending it', async () => {
    const { user, fake, onChange } = setup();
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    const zone = await screen.findByRole('group', { name: 'Upload a file' });

    fireEvent.drop(zone, {
      dataTransfer: {
        files: [new File(['x'], 'notes.txt', { type: 'text/plain' })],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That kind of file cannot be used here.'
    );
    expect(fake.calls.filter((c) => c.startsWith('POST'))).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['type_mismatch', 'The content of that file does not match its type.'],
    ['type_not_allowed', 'That kind of file cannot be used here.'],
    ['file_too_large', 'That file is too large.'],
    [
      'storage_unavailable',
      'Media storage is unavailable. Try again in a moment.',
    ],
    ['media_not_configured', 'Media storage is not set up'],
    ['something_new', 'Something went wrong: odd'],
  ])(
    'puts the service refusal %s in words and selects nothing',
    async (code, text) => {
      const { user, fake, onChange } = setup();
      choose(png());
      await user.click(
        await screen.findByRole('button', { name: 'Select image' })
      );
      await screen.findByText('Nothing has been uploaded yet.');
      fake.refuse({ status: 415, code, message: 'odd' });
      await user.click(screen.getByRole('button', { name: 'Choose a file' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    }
  );

  it('shows progress, and holds the picker steady while the file goes up', async () => {
    const fake = createFakeMediaService();
    const release = fake.holdUploads();
    const { user, onChange } = setup({ fake });
    choose(png('slow.png'));
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Choose a file' })
    );

    expect(await screen.findByText('Uploading slow.png…')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose a file' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    release();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  it('does not select a file that finished uploading after the picker was closed', async () => {
    const fake = createFakeMediaService();
    const release = fake.holdUploads();
    const { user, onChange } = setup({ fake });
    choose(png('late.png'));
    await user.click(
      await screen.findByRole('button', { name: 'Select image' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Choose a file' })
    );
    await screen.findByText('Uploading late.png…');

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    release();
    await waitFor(() =>
      expect(fake.files.map((f) => f.name)).toContain('late.png')
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});
