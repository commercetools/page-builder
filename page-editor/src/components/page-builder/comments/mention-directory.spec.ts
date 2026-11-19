import { useMentionSearch } from './mention-directory';
import { useOrgDirectory } from '../../../hooks/use-org-directory';
import { renderHookWithProviders } from '../../../test-utils/render';
import {
  buildOrgDirectory,
  buildOrgTeam,
  buildOrgUser,
  unavailableOrgDirectory,
} from '../../../test-utils/factories';

// The directory itself is covered by its own spec; here it is a collaborator, and
// what matters is which of the two branches `useMentionSearch` takes.
jest.mock('../../../hooks/use-org-directory', () => ({
  ...jest.requireActual('../../../hooks/use-org-directory'),
  useOrgDirectory: jest.fn(),
}));

const mockedUseOrgDirectory = useOrgDirectory as jest.MockedFunction<
  typeof useOrgDirectory
>;

const searchWith = (directory: ReturnType<typeof buildOrgDirectory>) => {
  mockedUseOrgDirectory.mockReturnValue(directory);
  return renderHookWithProviders(() => useMentionSearch()).result.current;
};

describe('useMentionSearch with a directory', () => {
  const sam = buildOrgUser({
    id: 'sam',
    email: 'sam@example.test',
    firstName: 'Sam',
    lastName: 'Smith',
  });
  const tess = buildOrgUser({
    id: 'tess',
    email: 'tess@example.test',
    firstName: 'Tess',
    lastName: 'Tester',
  });
  const directory = () =>
    buildOrgDirectory({ teams: [buildOrgTeam({ members: [sam, tess] })] });

  it('offers matching colleagues', () => {
    const results = searchWith(directory())('sam');
    expect(results).toEqual([
      {
        email: 'sam@example.test',
        name: 'Sam Smith',
        firstName: 'Sam',
        lastName: 'Smith',
      },
    ]);
  });

  it('matches on email as well as name', () => {
    expect(searchWith(directory())('tess@example').map((c) => c.email)).toEqual(
      ['tess@example.test']
    );
  });

  it('offers everyone for an empty query', () => {
    expect(searchWith(directory())('')).toHaveLength(2);
  });

  it('returns nothing when nobody matches', () => {
    expect(searchWith(directory())('nobody')).toEqual([]);
  });

  it('caps the list so the autocomplete stays usable', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      buildOrgUser({ id: `u${i}`, email: `u${i}@example.test` })
    );
    const results = searchWith(
      buildOrgDirectory({ teams: [buildOrgTeam({ members: many })] })
    )('');
    expect(results).toHaveLength(8);
  });

  it('falls back to the email when a user has no name', () => {
    const nameless = buildOrgUser({
      id: 'x',
      email: 'x@example.test',
      firstName: undefined,
      lastName: undefined,
    });
    const [candidate] = searchWith(
      buildOrgDirectory({ teams: [buildOrgTeam({ members: [nameless] })] })
    )('x@');
    expect(candidate.name).toBe('x@example.test');
  });
});

describe('useMentionSearch without a directory', () => {
  const search = () => searchWith(unavailableOrgDirectory());

  it('offers the typed value once it looks like an email', () => {
    expect(search()('someone@example.test')).toEqual([
      { email: 'someone@example.test', name: 'someone@example.test' },
    ]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(search()('  someone@example.test  ')[0].email).toBe(
      'someone@example.test'
    );
  });

  it.each(['', 'sam', 'sam@', '@example.test', 'sam@example', 'a b@c.test'])(
    'offers nothing for %p, which is not yet an email',
    (query) => expect(search()(query)).toEqual([])
  );
});
