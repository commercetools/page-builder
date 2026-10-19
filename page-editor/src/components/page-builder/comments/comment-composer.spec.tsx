import { CommentComposer } from './comment-composer';
import { useMentionSearch } from './mention-directory';
import {
  renderWithProviders,
  screen,
  waitFor,
} from '../../../test-utils/render';

// The directory-backed search has its own spec; here it is a collaborator.
jest.mock('./mention-directory', () => ({
  ...jest.requireActual('./mention-directory'),
  useMentionSearch: jest.fn(),
}));
const mockedSearch = useMentionSearch as jest.MockedFunction<
  typeof useMentionSearch
>;

const CANDIDATES = [
  {
    email: 'sam@example.test',
    name: 'Sam Smith',
    firstName: 'Sam',
    lastName: 'Smith',
  },
  {
    email: 'tess@example.test',
    name: 'Tess Tester',
    firstName: 'Tess',
    lastName: 'Tester',
  },
];

beforeEach(() => {
  mockedSearch.mockReturnValue((query: string) =>
    query === undefined
      ? []
      : CANDIDATES.filter((c) => c.email.includes(query.toLowerCase()))
  );
});

// The placeholder's double space is collapsed in the accessible name, so match
// on a pattern rather than the literal string.
const PLACEHOLDER = /Write a comment/;

const setup = (over: Partial<Parameters<typeof CommentComposer>[0]> = {}) => {
  const onSubmit = jest.fn();
  const rendered = renderWithProviders(
    <CommentComposer onSubmit={onSubmit} {...over} />
  );
  return { onSubmit, ...rendered };
};

const box = () => screen.findByRole('textbox', { name: PLACEHOLDER });
const submitButton = () => screen.getByRole('button', { name: 'Comment' });

describe('CommentComposer basics', () => {
  it('renders a labelled input', async () => {
    setup();
    expect(await box()).toBeInTheDocument();
  });

  it('uses a custom placeholder as the accessible name', async () => {
    setup({ placeholder: 'Reply…' });
    expect(
      await screen.findByRole('textbox', { name: 'Reply…' })
    ).toBeInTheDocument();
  });

  it('starts from an initial value when editing', async () => {
    setup({ initialValue: 'existing text' });
    expect(await box()).toHaveValue('existing text');
  });

  it('cannot submit an empty comment', async () => {
    setup();
    await box();
    expect(submitButton()).toBeDisabled();
  });

  it('cannot submit whitespace only', async () => {
    const { user } = setup();
    await user.type(await box(), '   ');
    expect(submitButton()).toBeDisabled();
  });

  it('submits the trimmed body', async () => {
    const { user, onSubmit } = setup();
    await user.type(await box(), '  hello  ');
    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('clears itself after submitting', async () => {
    const { user } = setup();
    const field = await box();
    await user.type(field, 'hello');
    await user.click(submitButton());

    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('submits on cmd/ctrl+Enter', async () => {
    const { user, onSubmit } = setup();
    await user.type(await box(), 'hello');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('does not submit on a bare Enter — that is a newline', async () => {
    const { user, onSubmit } = setup();
    await user.type(await box(), 'hello{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is inert while busy', async () => {
    setup({ busy: true, initialValue: 'hello' });
    await box();
    expect(submitButton()).toBeDisabled();
  });

  it('offers cancel only when the caller supports it', async () => {
    setup();
    await box();
    expect(
      screen.queryByRole('button', { name: /cancel/i })
    ).not.toBeInTheDocument();
  });

  it('cancels when offered', async () => {
    const onCancel = jest.fn();
    const { user } = setup({ onCancel });
    await box();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('CommentComposer mention autocomplete', () => {
  it('suggests colleagues once an @ query is typed', async () => {
    const { user } = setup();
    await user.type(await box(), 'ping @sam');

    expect(await screen.findByText('Sam Smith')).toBeInTheDocument();
    expect(screen.getByText('sam@example.test')).toBeInTheDocument();
  });

  it('shows no list before an @ is typed', async () => {
    const { user } = setup();
    await user.type(await box(), 'plain text');
    expect(screen.queryByText('Sam Smith')).not.toBeInTheDocument();
  });

  it('inserts the chosen mention into the body', async () => {
    const { user } = setup();
    const field = await box();
    await user.type(field, 'ping @sam');
    await user.click(await screen.findByText('Sam Smith'));

    await waitFor(() => expect(field).toHaveValue('ping @sam@example.test '));
  });

  it('closes the list after choosing', async () => {
    const { user } = setup();
    await user.type(await box(), 'ping @sam');
    await user.click(await screen.findByText('Sam Smith'));

    await waitFor(() =>
      expect(screen.queryByText('Sam Smith')).not.toBeInTheDocument()
    );
  });

  it('picks the highlighted candidate on Enter', async () => {
    const { user } = setup();
    const field = await box();
    await user.type(field, 'ping @example');
    await screen.findByText('Sam Smith');

    await user.keyboard('{Enter}');
    await waitFor(() => expect(field).toHaveValue('ping @sam@example.test '));
  });

  it('moves the highlight with the arrow keys', async () => {
    const { user } = setup();
    const field = await box();
    await user.type(field, 'ping @example');
    await screen.findByText('Sam Smith');

    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(field).toHaveValue('ping @tess@example.test '));
  });

  it('wraps the highlight around with ArrowUp', async () => {
    const { user } = setup();
    const field = await box();
    await user.type(field, 'ping @example');
    await screen.findByText('Sam Smith');

    await user.keyboard('{ArrowUp}{Enter}');
    await waitFor(() => expect(field).toHaveValue('ping @tess@example.test '));
  });

  it('dismisses the list on Escape without inserting', async () => {
    const { user } = setup();
    const field = await box();
    await user.type(field, 'ping @sam');
    await screen.findByText('Sam Smith');

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByText('Sam Smith')).not.toBeInTheDocument()
    );
    expect(field).toHaveValue('ping @sam');
  });

  it('does not submit on Enter while the mention list is open', async () => {
    const { user, onSubmit } = setup();
    await user.type(await box(), 'ping @sam');
    await screen.findByText('Sam Smith');

    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('highlights the candidate the pointer is over', async () => {
    const { user } = setup();
    const field = await box();
    await user.type(field, 'ping @example');
    const second = await screen.findByText('Tess Tester');

    await user.hover(second);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(field).toHaveValue('ping @tess@example.test '));
  });
});
