/**
 * Builders for the organization directory.
 *
 * The directory degrades: `available: false` is a first-class state (a user who
 * cannot read org members, an unreachable admin target, an org with no teams), and
 * callers are required to cope with it. `unavailableOrgDirectory()` makes that path
 * as easy to set up as the happy one.
 */
import type {
  OrgDirectoryValue,
  OrgTeam,
  OrgUser,
} from '../../hooks/use-org-directory';
import { nextId } from './page';

export const buildOrgUser = (over: Partial<OrgUser> = {}): OrgUser => {
  const id = over.id ?? nextId('user');
  return {
    id,
    email: `${id}@example.test`,
    firstName: 'Tess',
    lastName: 'Tester',
    ...over,
  };
};

export const buildOrgTeam = (over: Partial<OrgTeam> = {}): OrgTeam => ({
  id: nextId('team'),
  name: 'Editors',
  members: [buildOrgUser()],
  ...over,
});

/**
 * A directory value with working local search and membership checks, so a test
 * gets realistic behaviour rather than a stub that returns constants.
 */
export const buildOrgDirectory = (
  over: Partial<OrgDirectoryValue> = {}
): OrgDirectoryValue => {
  const teams = over.teams ?? [buildOrgTeam()];
  const users = over.users ?? [
    ...new Map(teams.flatMap((t) => t.members).map((u) => [u.id, u])).values(),
  ];
  const currentUserId = over.currentUserId ?? users[0]?.id ?? null;

  return {
    loading: false,
    available: true,
    orgId: 'org-1',
    orgName: 'Test Org',
    teams,
    users,
    currentUserId,
    searchUsers: (query: string, limit = 8) => {
      const q = query.trim().toLowerCase();
      if (!q) return users.slice(0, limit);
      return users
        .filter((u) =>
          [u.email, u.firstName, u.lastName]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(q))
        )
        .slice(0, limit);
    },
    isMemberOfTeam: (teamId: string, userId?: string) => {
      const who = userId ?? currentUserId;
      return Boolean(
        teams.find((t) => t.id === teamId)?.members.some((m) => m.id === who)
      );
    },
    ...over,
  };
};

/** The degraded directory — nothing was readable. */
export const unavailableOrgDirectory = (
  over: Partial<OrgDirectoryValue> = {}
): OrgDirectoryValue =>
  buildOrgDirectory({
    available: false,
    orgId: null,
    orgName: null,
    teams: [],
    users: [],
    currentUserId: null,
    searchUsers: () => [],
    isMemberOfTeam: () => false,
    ...over,
  });
