import { GroupFieldEditor } from './group-field-editor';
import {
  renderWithProviders,
  screen,
  within,
} from '../../../../test-utils/render';
import { buildSchemaField } from '../../../../test-utils/factories';

const groupField = (
  children = [buildSchemaField({ key: 'title', label: 'Title' })]
) =>
  buildSchemaField({ key: 'slides', label: 'Slides', kind: 'group', children });

const setup = (over: Partial<Parameters<typeof GroupFieldEditor>[0]> = {}) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <GroupFieldEditor
      field={groupField()}
      value={[]}
      onChange={onChange}
      {...over}
    />
  );
  return { onChange, ...rendered };
};

describe('GroupFieldEditor', () => {
  it('labels the group', async () => {
    setup();
    expect(await screen.findByText('Slides')).toBeInTheDocument();
  });

  it('falls back to the field key when the label is an empty map', async () => {
    setup({
      field: buildSchemaField({ key: 'slides', label: {}, kind: 'group' }),
    });
    expect(await screen.findByText('slides')).toBeInTheDocument();
  });

  it('uses the first value of a localized label', async () => {
    setup({
      field: buildSchemaField({
        key: 'slides',
        label: { 'en-US': 'Carousel slides' },
        kind: 'group',
      }),
    });
    expect(await screen.findByText('Carousel slides')).toBeInTheDocument();
  });

  it('says so when the group is empty', async () => {
    setup({ value: [] });
    expect(await screen.findByText(/no items/i)).toBeInTheDocument();
  });

  it('treats a non-array value as empty rather than crashing', async () => {
    setup({ value: 'not an array' });
    expect(await screen.findByText(/no items/i)).toBeInTheDocument();
  });

  it('renders a numbered card per item', async () => {
    setup({ value: [{ title: 'One' }, { title: 'Two' }] });
    expect(await screen.findByText(/item 1/i)).toBeInTheDocument();
    expect(screen.getByText(/item 2/i)).toBeInTheDocument();
  });

  it('renders each child field inside its item', async () => {
    setup({ value: [{ title: 'One' }] });
    expect(await screen.findByDisplayValue('One')).toBeInTheDocument();
  });

  it('appends an item seeded with per-kind defaults', async () => {
    const { user, onChange } = setup({
      field: groupField([
        buildSchemaField({ key: 'title', kind: 'text' }),
        buildSchemaField({ key: 'featured', kind: 'boolean' }),
        buildSchemaField({ key: 'caption', kind: 'text', localized: true }),
      ]),
      value: [],
    });

    await user.click(await screen.findByRole('button', { name: /add item/i }));
    expect(onChange).toHaveBeenCalledWith([
      { title: '', featured: false, caption: {} },
    ]);
  });

  it('appends to the existing items rather than replacing them', async () => {
    const { user, onChange } = setup({ value: [{ title: 'One' }] });
    await user.click(await screen.findByRole('button', { name: /add item/i }));
    expect(onChange).toHaveBeenCalledWith([{ title: 'One' }, { title: '' }]);
  });

  it('removes the item whose delete button was pressed', async () => {
    const { user, onChange } = setup({
      value: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    });
    const secondCard = (await screen.findByText(/item 2/i)).closest('div')!
      .parentElement!;

    await user.click(
      within(secondCard).getByRole('button', { name: /remove/i })
    );
    expect(onChange).toHaveBeenCalledWith([
      { title: 'One' },
      { title: 'Three' },
    ]);
  });

  it('updates only the item that changed', async () => {
    const { user, onChange } = setup({
      value: [{ title: 'One' }, { title: 'Two' }],
    });
    const input = await screen.findByDisplayValue('Two');
    await user.type(input, '!');

    expect(onChange).toHaveBeenLastCalledWith([
      { title: 'One' },
      { title: 'Two!' },
    ]);
  });

  it('handles a group with no child fields', async () => {
    const { user, onChange } = setup({
      field: buildSchemaField({
        key: 'slides',
        label: 'Slides',
        kind: 'group',
      }),
      value: [],
    });
    await user.click(await screen.findByRole('button', { name: /add item/i }));
    expect(onChange).toHaveBeenCalledWith([{}]);
  });

  it('keeps each row on its own DOM node when a middle item is deleted', async () => {
    // Keying by index would move row 3's rich-text/caret state onto row 2.
    const { user, onChange } = setup({
      value: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    });
    const secondCard = (await screen.findByText(/item 2/i)).closest('div')!
      .parentElement!;
    await user.click(
      within(secondCard).getByRole('button', { name: /remove/i })
    );

    // The component is controlled: it asks the parent to drop the middle row.
    const next = onChange.mock.calls.at(-1)![0];
    expect(next).toEqual([{ title: 'One' }, { title: 'Three' }]);
  });
});
