import { SchemaFieldEditor } from './schema-field-editor';
import {
  renderWithProviders,
  screen,
  within,
} from '../../../../test-utils/render';
import { buildSchemaField } from '../../../../test-utils/factories';

const setup = (
  field: Parameters<typeof buildSchemaField>[0],
  value: unknown = undefined,
  languages = ['en-US', 'de-DE']
) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <SchemaFieldEditor
      field={buildSchemaField(field)}
      value={value}
      onChange={onChange}
    />,
    { project: { languages } }
  );
  return { onChange, ...rendered };
};

/**
 * The number, select and rich-text controls carry no accessible name — a real
 * defect. Swallow the resulting React Aria warning so
 * these tests exercise the dispatcher rather than re-reporting that.
 */
const allowUnlabelledControl = () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  return () => warn.mockRestore();
};

describe('SchemaFieldEditor labelling', () => {
  it('uses a plain string label', async () => {
    setup({ key: 'title', label: 'Headline' });
    expect(await screen.findByText('Headline')).toBeInTheDocument();
  });

  it('uses the first value of a localized label', async () => {
    setup({ key: 'title', label: { 'en-US': 'Headline' } });
    expect(await screen.findByText('Headline')).toBeInTheDocument();
  });

  it('falls back to the field key when the label map is empty', async () => {
    setup({ key: 'title', label: {} });
    expect(await screen.findByText('title')).toBeInTheDocument();
  });

  it('marks a required field differently from an optional one', async () => {
    const optional = setup({ key: 'title', label: 'Headline' });
    const optionalHtml = (await optional.findByText('Headline')).parentElement!
      .innerHTML;
    optional.unmount();

    const required = setup({ key: 'title', label: 'Headline', required: true });
    const requiredHtml = (await required.findByText('Headline')).parentElement!
      .innerHTML;

    expect(requiredHtml).not.toBe(optionalHtml);
  });
});

describe('SchemaFieldEditor boolean', () => {
  it('renders a labelled switch, bypassing the form field wrapper', async () => {
    setup({ key: 'featured', label: 'Featured', kind: 'boolean' }, true);
    expect(
      await screen.findByRole('switch', { name: /Featured/ })
    ).toBeChecked();
  });

  it('reports the toggled value', async () => {
    const { user, onChange } = setup(
      { key: 'featured', label: 'Featured', kind: 'boolean' },
      false
    );
    await user.click(await screen.findByRole('switch', { name: /Featured/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('ignores `localized` on a boolean', async () => {
    setup(
      { key: 'featured', label: 'Featured', kind: 'boolean', localized: true },
      true
    );
    expect(
      await screen.findByRole('switch', { name: /Featured/ })
    ).toBeChecked();
  });
});

describe('SchemaFieldEditor non-localized fields', () => {
  it('renders a text input', async () => {
    setup({ key: 'title', label: 'Headline', kind: 'text' }, 'Welcome');
    expect(await screen.findByDisplayValue('Welcome')).toBeInTheDocument();
  });

  it('reports what was typed', async () => {
    const { user, onChange } = setup({ key: 'title', label: 'Headline' }, '');
    await user.type(await screen.findByRole('textbox', { name: 'title' }), 'A');
    expect(onChange).toHaveBeenLastCalledWith('A');
  });

  it('renders a number input', async () => {
    const restore = allowUnlabelledControl();
    const { container } = setup(
      { key: 'limit', label: 'Limit', kind: 'number' },
      5
    );
    await screen.findByText('Limit');
    expect(container.querySelector('input')).toHaveValue('5');
    restore();
  });

  it('renders a select', async () => {
    const restore = allowUnlabelledControl();
    setup(
      {
        key: 'variant',
        label: 'Variant',
        kind: 'select',
        options: [{ key: 'a', label: 'Option A' }],
      },
      'a'
    );
    expect(await screen.findByText('Variant')).toBeInTheDocument();
    restore();
  });
});

describe('SchemaFieldEditor localized fields', () => {
  // `LocalizedField` shows only the default locale until the expander is pressed,
  // so the other locales have to be revealed before they can be asserted on.
  const expandLocales = async (user: {
    click: (el: Element) => Promise<void>;
  }) => {
    await user.click(await screen.findByRole('button'));
  };

  it('shows the default locale first, and the rest behind the expander', async () => {
    const { user } = setup(
      { key: 'title', label: 'Headline', kind: 'text', localized: true },
      { 'en-US': 'Welcome', 'de-DE': 'Willkommen' }
    );

    expect(await screen.findByDisplayValue('Welcome')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Willkommen')).not.toBeInTheDocument();

    await expandLocales(user);
    expect(await screen.findByDisplayValue('Willkommen')).toBeInTheDocument();
  });

  it('fills in every project locale, even ones with no value yet', async () => {
    const { user, container } = setup(
      { key: 'title', label: 'Headline', kind: 'text', localized: true },
      { 'en-US': 'Welcome' }
    );
    await screen.findByDisplayValue('Welcome');
    await expandLocales(user);

    // One input per project locale, the missing one blank rather than absent.
    expect(container.querySelectorAll('input')).toHaveLength(2);
  });

  it('treats a non-object value as an empty locale map', async () => {
    const { user, container } = setup(
      { key: 'title', label: 'Headline', kind: 'text', localized: true },
      'not a map'
    );
    await screen.findByText('Headline');
    await expandLocales(user);

    expect(container.querySelectorAll('input')).toHaveLength(2);
    for (const input of container.querySelectorAll('input')) {
      expect(input).toHaveValue('');
    }
  });

  it('reports a change for the locale that was edited, keeping the others', async () => {
    const { user, onChange } = setup(
      { key: 'title', label: 'Headline', kind: 'text', localized: true },
      { 'en-US': 'Welcome', 'de-DE': 'Willkommen' }
    );
    await user.type(await screen.findByDisplayValue('Welcome'), '!');

    expect(onChange).toHaveBeenLastCalledWith({
      'en-US': 'Welcome!',
      'de-DE': 'Willkommen',
    });
  });

  it('renders locale tabs for localized rich text', async () => {
    setup(
      { key: 'body', label: 'Body', kind: 'richtext', localized: true },
      { 'en-US': '<p>Hi</p>' }
    );
    expect(
      await screen.findByRole('button', { name: 'en-US' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'de-DE' })).toBeInTheDocument();
  });

  it('renders a single select for a localized select, writing the default locale', async () => {
    const restore = allowUnlabelledControl();
    const { user, onChange } = setup(
      {
        key: 'variant',
        label: 'Variant',
        kind: 'select',
        localized: true,
        options: [{ key: 'a', label: { 'en-US': 'Option A' } }],
      },
      {}
    );

    await user.click(await screen.findByRole('button', { expanded: false }));
    await user.click(
      within(await screen.findByRole('listbox')).getByText('Option A')
    );

    expect(onChange).toHaveBeenCalledWith({ 'en-US': 'a' });
    restore();
  });

  it('falls back through localized option labels', async () => {
    const restore = allowUnlabelledControl();
    const { user } = setup(
      {
        key: 'variant',
        label: 'Variant',
        kind: 'select',
        localized: true,
        options: [
          { key: 'only-de', label: { 'de-DE': 'Nur Deutsch' } },
          { key: 'no-label', label: {} },
        ],
      },
      {}
    );

    await user.click(await screen.findByRole('button', { expanded: false }));
    const list = await screen.findByRole('listbox');
    // No en-US label, so the first available one; then the key as last resort.
    expect(within(list).getByText('Nur Deutsch')).toBeInTheDocument();
    expect(within(list).getByText('no-label')).toBeInTheDocument();
    restore();
  });

  it('renders a plain select when a localized select declares no options', async () => {
    const restore = allowUnlabelledControl();
    setup(
      { key: 'variant', label: 'Variant', kind: 'select', localized: true },
      {}
    );
    // Falls through to the LocalizedField branch rather than crashing.
    expect(await screen.findByText('Variant')).toBeInTheDocument();
    restore();
  });
});
