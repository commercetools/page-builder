import { FormField } from '@commercetools/nimbus';
import { FieldInput } from './field-input';
import {
  renderWithProviders,
  screen,
  within,
} from '../../../../test-utils/render';

/**
 * `SchemaFieldEditor` always renders `FieldInput` inside a `FormField` that
 * supplies the label, and several of the inputs (number, select, rich text) have
 * no `aria-label` of their own because of that. Testing them bare would fail on a
 * React Aria labelling warning that never occurs in the app, so the harness
 * mirrors the real parent.
 */
const setup = (over: Partial<Parameters<typeof FieldInput>[0]> = {}) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <FormField.Root size="sm">
      <FormField.Label>Title</FormField.Label>
      <FormField.Input>
        <FieldInput
          fieldKey="title"
          value=""
          kind="text"
          onChange={onChange}
          {...over}
        />
      </FormField.Input>
    </FormField.Root>
  );
  return { onChange, ...rendered };
};

/** The select trigger — the only combobox-like button in the field. */
const selectTrigger = () => screen.findByRole('button', { expanded: false });

/**
 * The number, select and rich-text branches pass no `aria-label`, and
 * `FormField.Label` does not reach them, so React Aria warns that the control has
 * no accessible name. That is a real defect (see findings.md #4) — these tests
 * record the behaviour as it stands rather than papering over it, and will start
 * failing loudly if someone fixes it, which is the moment to delete this helper.
 */
const expectUnlabelledControlWarning = () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  return () => {
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('you must specify an aria-label')
    );
    warn.mockRestore();
  };
};

describe('FieldInput text (the default)', () => {
  it('renders a labelled text box', async () => {
    setup();
    expect(
      await screen.findByRole('textbox', { name: 'title' })
    ).toBeInTheDocument();
  });

  it('shows the current value', async () => {
    setup({ value: 'Welcome' });
    expect(await screen.findByRole('textbox', { name: 'title' })).toHaveValue(
      'Welcome'
    );
  });

  it('renders an empty box for a null or undefined value', async () => {
    setup({ value: null });
    expect(await screen.findByRole('textbox', { name: 'title' })).toHaveValue(
      ''
    );
  });

  it('reports what was typed', async () => {
    const { user, onChange } = setup();
    await user.type(
      await screen.findByRole('textbox', { name: 'title' }),
      'Hi'
    );
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0]).toEqual(expect.any(String));
  });

  it('falls back to a text box for an unrecognized kind', async () => {
    setup({ kind: 'something-new' });
    expect(
      await screen.findByRole('textbox', { name: 'title' })
    ).toBeInTheDocument();
  });

  it('falls back to a text box for a select with no options', async () => {
    setup({ kind: 'select', options: undefined });
    expect(
      await screen.findByRole('textbox', { name: 'title' })
    ).toBeInTheDocument();
  });
});

describe('FieldInput boolean', () => {
  it('renders a switch labelled with the field key', async () => {
    setup({ kind: 'boolean', value: true });
    expect(await screen.findByRole('switch', { name: /title/ })).toBeChecked();
  });

  it('coerces a truthy non-boolean value', async () => {
    setup({ kind: 'boolean', value: 'yes' });
    expect(await screen.findByRole('switch', { name: /title/ })).toBeChecked();
  });

  it('reports the toggled value', async () => {
    const { user, onChange } = setup({ kind: 'boolean', value: false });
    await user.click(await screen.findByRole('switch', { name: /title/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('FieldInput number', () => {
  it('shows the current number', async () => {
    const assertWarned = expectUnlabelledControlWarning();
    const { container } = setup({ kind: 'number', value: 42 });
    await screen.findByText('Title');
    expect(container.querySelector('input')).toHaveValue('42');
    assertWarned();
  });

  it('shows zero for a non-numeric value rather than NaN', async () => {
    const assertWarned = expectUnlabelledControlWarning();
    const { container } = setup({ kind: 'number', value: 'not a number' });
    await screen.findByText('Title');
    expect(container.querySelector('input')).toHaveValue('0');
    assertWarned();
  });
});

describe('FieldInput select', () => {
  const options = [
    { key: 'a', label: 'Option A' },
    { key: 'b', label: { 'en-US': 'Option B' } },
  ];

  it('renders a select control', async () => {
    const assertWarned = expectUnlabelledControlWarning();
    setup({ kind: 'select', options, value: 'a' });
    expect(await selectTrigger()).toHaveAttribute('aria-haspopup', 'listbox');
    assertWarned();
  });

  it('lists both plain and localized option labels', async () => {
    const assertWarned = expectUnlabelledControlWarning();
    const { user } = setup({ kind: 'select', options, value: '' });
    await user.click(await selectTrigger());

    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('Option A')).toBeInTheDocument();
    expect(within(list).getByText('Option B')).toBeInTheDocument();
    assertWarned();
  });

  it('reports the chosen key', async () => {
    const assertWarned = expectUnlabelledControlWarning();
    const { user, onChange } = setup({ kind: 'select', options, value: '' });
    await user.click(await selectTrigger());
    await user.click(
      within(await screen.findByRole('listbox')).getByText('Option A')
    );
    expect(onChange).toHaveBeenCalledWith('a');
    assertWarned();
  });

  it('falls back to the option key when a localized label is empty', async () => {
    const assertWarned = expectUnlabelledControlWarning();
    const { user } = setup({
      kind: 'select',
      options: [{ key: 'fallback', label: {} }],
      value: '',
    });
    await user.click(await selectTrigger());
    expect(
      within(await screen.findByRole('listbox')).getByText('fallback')
    ).toBeInTheDocument();
    assertWarned();
  });
});
