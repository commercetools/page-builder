import type { ReactNode } from 'react';
import {
  OrgDirectoryProvider,
  orgUserName,
  useOrgDirectory,
} from './use-org-directory';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import {
  installMockServer,
  failOperation,
  respondWith,
} from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

installMockServer();

const member = (
  id: string,
  over: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } = {}
) => ({
  __typename: 'User',
  id,
  email: over.email === undefined ? `${id}@example.test` : over.email,
  firstName: over.firstName ?? null,
  lastName: over.lastName ?? null,
});

const team = (id: string, name: string, members: unknown[] = []) => ({
  __typename: 'Team',
  id,
  name,
  members,
});

const directoryReturns = (
  owner: { id: string; name: string; teams: unknown[] } | null
) =>
  server.use(
    respondWith('FetchOrgTeamsByProject', {
      myProjects: {
        __typename: 'ProjectQueryResult',
        results: [
          {
            __typename: 'Project',
            id: 'proj-1',
            key: 'test-project',
            owner: owner ? { __typename: 'Organization', ...owner } : null,
          },
        ],
      },
    })
  );

const wrapper = ({ children }: { children?: ReactNode }) => (
  <OrgDirectoryProvider>{children}</OrgDirectoryProvider>
);

const renderDirectory = () =>
  renderHookWithProviders(() => useOrgDirectory(), { wrapper });

describe('useOrgDirectory outside a provider', () => {
  it('fails loudly rather than returning a silently empty directory', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHookWithProviders(() => useOrgDirectory())).toThrow(
      /must be used within an OrgDirectoryProvider/
    );
    error.mockRestore();
  });
});

describe('OrgDirectoryProvider', () => {
  it('exposes the org, its teams and the de-duplicated members', async () => {
    const shared = member('u1', { firstName: 'Tess', lastName: 'Tester' });
    directoryReturns({
      id: 'org-1',
      name: 'Test Org',
      teams: [
        team('t1', 'Editors', [shared, member('u2')]),
        // u1 is on both teams and must appear once in `users`.
        team('t2', 'Legal', [shared]),
      ],
    });

    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.available).toBe(true));

    expect(result.current.orgId).toBe('org-1');
    expect(result.current.orgName).toBe('Test Org');
    expect(result.current.teams).toHaveLength(2);
    expect(result.current.users.map((u) => u.id).sort()).toEqual(['u1', 'u2']);
  });

  it('is unavailable when the org has no teams', async () => {
    directoryReturns({ id: 'org-1', name: 'Test Org', teams: [] });

    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    expect(result.current.users).toEqual([]);
  });

  it('is unavailable, not broken, when the admin target rejects the read', async () => {
    // A user without org-read permission must still get a usable app.
    server.use(failOperation('FetchOrgTeamsByProject', 'forbidden'));

    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.available).toBe(false);
    expect(result.current.teams).toEqual([]);
  });

  it('is unavailable when the project has no owner', async () => {
    directoryReturns(null);

    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    expect(result.current.orgId).toBeNull();
  });

  it('normalizes a member with no email to an empty string', async () => {
    directoryReturns({
      id: 'org-1',
      name: 'Org',
      teams: [team('t1', 'Editors', [member('u1', { email: null })])],
    });

    const { result } = renderDirectory();
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.users[0].email).toBe('');
  });

  describe('searchUsers', () => {
    const seed = () =>
      directoryReturns({
        id: 'org-1',
        name: 'Org',
        teams: [
          team('t1', 'Editors', [
            member('sam', {
              email: 'sam@example.test',
              firstName: 'Sam',
              lastName: 'Smith',
            }),
            member('tess', {
              email: 'tess@example.test',
              firstName: 'Tess',
              lastName: 'Tester',
            }),
            // No email — never offered as a mention target.
            member('ghost', { email: null, firstName: 'Ghost' }),
          ]),
        ],
      });

    it('matches on email', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.searchUsers('sam@').map((u) => u.id)).toEqual([
        'sam',
      ]);
    });

    it('matches on full name', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(
        result.current.searchUsers('tess tester').map((u) => u.id)
      ).toEqual(['tess']);
    });

    it('is case-insensitive', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.searchUsers('SAM').map((u) => u.id)).toEqual([
        'sam',
      ]);
    });

    it('offers everyone with an email for an empty query', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.searchUsers('').map((u) => u.id)).toEqual([
        'sam',
        'tess',
      ]);
    });

    it('honours the limit', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.searchUsers('', 1)).toHaveLength(1);
    });

    it('returns nothing when nobody matches', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.searchUsers('nobody')).toEqual([]);
    });
  });

  describe('isMemberOfTeam', () => {
    const seed = () =>
      directoryReturns({
        id: 'org-1',
        name: 'Org',
        teams: [
          team('t1', 'Editors', [member('user-1'), member('sam')]),
          team('t2', 'Legal', [member('other')]),
        ],
      });

    it('confirms membership for a named user', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.isMemberOfTeam('t1', 'sam')).toBe(true);
      expect(result.current.isMemberOfTeam('t2', 'sam')).toBe(false);
    });

    it('defaults to the current user', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      // The harness signs in as `user-1`.
      expect(result.current.currentUserId).toBe('user-1');
      expect(result.current.isMemberOfTeam('t1')).toBe(true);
      expect(result.current.isMemberOfTeam('t2')).toBe(false);
    });

    it('denies membership of a team that does not exist', async () => {
      seed();
      const { result } = renderDirectory();
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.isMemberOfTeam('nope', 'sam')).toBe(false);
    });
  });
});

describe('orgUserName', () => {
  it('joins first and last name', () => {
    expect(
      orgUserName({
        id: 'u',
        email: 'u@e.test',
        firstName: 'Tess',
        lastName: 'Tester',
      })
    ).toBe('Tess Tester');
  });

  it('uses whichever name part is present', () => {
    expect(orgUserName({ id: 'u', email: 'u@e.test', firstName: 'Tess' })).toBe(
      'Tess'
    );
    expect(
      orgUserName({ id: 'u', email: 'u@e.test', lastName: 'Tester' })
    ).toBe('Tester');
  });

  it('falls back to the email when there is no name', () => {
    expect(orgUserName({ id: 'u', email: 'u@e.test' })).toBe('u@e.test');
  });
});
