import { ConfigForm } from './config-form';
import {
  renderWithProviders,
  screen,
  waitFor,
} from '../../../test-utils/render';
import { installMockServer, respondWith } from '../../../test-utils/msw';
import { server } from '../../../test-utils/msw/server';
import { buildSchemaField } from '../../../test-utils/factories';

installMockServer();

/**
 * Several control kinds render without an accessible name — findings.md #4 —
 * so the resulting React Aria warning is swallowed here rather than re-reported.
 */
let unlabelled: jest.SpyInstance;
beforeEach(() => {
  unlabelled = jest.spyOn(console, 'warn').mockImplementation(() => {});
  server.use(
    respondWith('FetchProductsByIds', {
      products: { __typename: 'ProductQueryResult', results: [] },
    }),
    respondWith('FetchCategoriesByIds', {
      categories: { __typename: 'CategoryQueryResult', results: [] },
    })
  );
});
afterEach(() => unlabelled.mockRestore());

const setup = (
  schema: Parameters<typeof buildSchemaField>[0][],
  value: Record<string, unknown> = {}
) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <ConfigForm
      schema={schema.map((f) => buildSchemaField(f))}
      value={value}
      onChange={onChange}
    />
  );
  return { onChange, ...rendered };
};

describe('ConfigForm field kinds', () => {
  it('renders nothing for an empty schema', async () => {
    const { container } = setup([]);
    await waitFor(() =>
      expect(container.querySelectorAll('input')).toHaveLength(0)
    );
  });

  it('renders a text field and reports edits', async () => {
    const { user, onChange } = setup(
      [{ key: 'title', label: 'Title', kind: 'text' }],
      { title: 'Hello' }
    );

    await user.type(await screen.findByDisplayValue('Hello'), '!');
    expect(onChange).toHaveBeenLastCalledWith({ title: 'Hello!' });
  });

  it('renders a boolean as a switch', async () => {
    const { user, onChange } = setup(
      [{ key: 'featured', label: 'Featured', kind: 'boolean' }],
      { featured: false }
    );

    await user.click(await screen.findByRole('switch', { name: /Featured/ }));
    expect(onChange).toHaveBeenCalledWith({ featured: true });
  });

  it('renders a number field', async () => {
    const { container } = setup(
      [{ key: 'limit', label: 'Limit', kind: 'number' }],
      {
        limit: 5,
      }
    );
    await screen.findByText('Limit');
    expect(container.querySelector('input')).toHaveValue('5');
  });

  it('renders a select with its options', async () => {
    const { user } = setup(
      [
        {
          key: 'sort',
          label: 'Sort',
          kind: 'select',
          options: [{ key: 'name', label: 'By name' }],
        },
      ],
      {}
    );

    await user.click(await screen.findByRole('button', { expanded: false }));
    // Nimbus renders both a listbox option and a hidden native <option>.
    expect((await screen.findAllByText('By name')).length).toBeGreaterThan(0);
  });

  it('renders a rich-text field', async () => {
    setup([{ key: 'body', label: 'Body', kind: 'richtext' }], {
      body: '<p>Hi</p>',
    });
    expect(await screen.findByText('Body')).toBeInTheDocument();
  });

  it('renders a product picker', async () => {
    setup([{ key: 'product', label: 'Product', kind: 'product' }], {});
    expect(
      await screen.findByRole('textbox', { name: 'Search products…' })
    ).toBeInTheDocument();
  });

  it('renders a category picker', async () => {
    setup([{ key: 'category', label: 'Category', kind: 'category' }], {});
    expect(
      await screen.findByRole('textbox', { name: 'Search categories…' })
    ).toBeInTheDocument();
  });

  it('renders a product picks list', async () => {
    setup([{ key: 'picks', label: 'Picks', kind: 'productPicks' }], {
      picks: [],
    });
    expect(
      await screen.findByRole('button', { name: 'Add product' })
    ).toBeInTheDocument();
  });

  it('renders a category picks list', async () => {
    setup([{ key: 'cats', label: 'Categories', kind: 'categoryPicks' }], {
      cats: [],
    });
    expect(
      await screen.findByRole('button', { name: 'Add category' })
    ).toBeInTheDocument();
  });

  it('renders a product pins list', async () => {
    setup([{ key: 'pins', label: 'Pins', kind: 'productPins' }], { pins: [] });
    expect(
      await screen.findByRole('button', { name: 'Add pin' })
    ).toBeInTheDocument();
  });

  it('renders a category pins list', async () => {
    setup([{ key: 'catPins', label: 'Category pins', kind: 'categoryPins' }], {
      catPins: [],
    });
    expect(
      await screen.findByRole('button', { name: 'Pin a category' })
    ).toBeInTheDocument();
  });

  it('renders an image field', async () => {
    setup([{ key: 'hero', label: 'Hero image', kind: 'image' }], {});
    expect(await screen.findByText('Hero image')).toBeInTheDocument();
  });

  it('renders a video field', async () => {
    setup([{ key: 'clip', label: 'Clip', kind: 'video' }], {});
    expect(await screen.findByText('Clip')).toBeInTheDocument();
  });
});

describe('ConfigForm patching', () => {
  it('patches only the field that changed', async () => {
    const { user, onChange } = setup(
      [
        { key: 'title', label: 'Title', kind: 'text' },
        { key: 'other', label: 'Other', kind: 'text' },
      ],
      { title: 'Hello', other: 'keep me' }
    );

    await user.type(await screen.findByDisplayValue('Hello'), '!');
    expect(onChange).toHaveBeenLastCalledWith({
      title: 'Hello!',
      other: 'keep me',
    });
  });

  it('renders every field in the schema', async () => {
    setup(
      [
        { key: 'a', label: 'Field A', kind: 'text' },
        { key: 'b', label: 'Field B', kind: 'boolean' },
      ],
      {}
    );

    expect(await screen.findByText('Field A')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Field B/ })).toBeInTheDocument();
  });
});
