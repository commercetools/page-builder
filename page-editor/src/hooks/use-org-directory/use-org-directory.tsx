import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { gql, type ApolloError } from '@apollo/client';
import {
  useMcQuery,
  useApplicationContext,
} from '@commercetools-frontend/application-shell-connectors';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OrgUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

export type OrgTeam = {
  id: string;
  name: string;
  members: OrgUser[];
};

export type OrgDirectoryValue = {
  loading: boolean;
  error?: ApolloError;
  /**
   * True once a real roster (≥1 team) has been read. When false — a user who
   * cannot read org members, an admin-target that is unreachable, or an org
   * with no teams — callers must degrade gracefully: @-mention autocomplete
   * falls back to free-text email, and hard workflow enforcement cannot verify
   * membership so it falls back to attribution-only.
   */
  available: boolean;
  orgId: string | null;
  orgName: string | null;
  teams: OrgTeam[];
  /** All members across all teams, flattened and de-duped by id. */
  users: OrgUser[];
  /** Local, cache-only filter for @-mention autocomplete (no network). */
  searchUsers: (query: string, limit?: number) => OrgUser[];
  /** Membership check for hard workflow enforcement; defaults to current user. */
  isMemberOfTeam: (teamId: string, userId?: string) => boolean;
  currentUserId: string | null;
};

// ---------------------------------------------------------------------------
// Query (administration target — inline gql, NOT a .ctp.graphql file, because
// it validates against the administration schema rather than CTP and must
// bypass the app's CTP codegen). Recipe mirrors the MC account app's
// project-scoped `myProjects(...).owner.teams` pattern.
// ---------------------------------------------------------------------------

const FetchOrgTeamsByProject = gql`
  query FetchOrgTeamsByProject($where: String!) {
    myProjects(where: $where) {
      results {
        id
        key
        owner {
          id
          name
          teams {
            id
            name
            members {
              id
              email
              firstName
              lastName
            }
          }
        }
      }
    }
  }
`;

type RawMember = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};
type RawTeam = { id: string; name: string; members?: RawMember[] | null };
type RawOwner = { id: string; name: string; teams?: RawTeam[] | null } | null;
type FetchResult = {
  myProjects?: {
    results: Array<{ id: string; key: string; owner?: RawOwner }>;
  } | null;
};
type FetchVars = { where: string };

// ---------------------------------------------------------------------------
// Context + provider
// ---------------------------------------------------------------------------

const OrgDirectoryContext = createContext<OrgDirectoryValue | null>(null);

const fullName = (u: RawMember): string =>
  [u.firstName, u.lastName].filter(Boolean).join(' ').trim();

export const OrgDirectoryProvider = ({ children }: { children: ReactNode }) => {
  const projectKey = useApplicationContext((ctx) => ctx.project?.key);
  const currentUserId = useApplicationContext((ctx) => ctx.user?.id) ?? null;

  const { data, error, loading } = useMcQuery<FetchResult, FetchVars>(
    FetchOrgTeamsByProject,
    {
      skip: !projectKey,
      variables: { where: `key="${projectKey ?? ''}"` },
      context: { target: GRAPHQL_TARGETS.ADMINISTRATION_SERVICE },
      // Read once and serve every consumer (mentions, assignee picker,
      // enforcement) from cache. Fail-soft: never let a blocked admin target
      // crash the app — `available` gates the degraded fallbacks instead.
      fetchPolicy: 'cache-first',
      onError: () => undefined,
    }
  );

  const value = useMemo<OrgDirectoryValue>(() => {
    const owner = data?.myProjects?.results?.[0]?.owner ?? null;

    const teams: OrgTeam[] = (owner?.teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      members: (t.members ?? []).map((m) => ({
        id: m.id,
        email: m.email ?? '',
        firstName: m.firstName ?? undefined,
        lastName: m.lastName ?? undefined,
      })),
    }));

    const byId = new Map<string, OrgUser>();
    for (const t of teams) {
      for (const m of t.members) {
        if (!byId.has(m.id)) byId.set(m.id, m);
      }
    }
    const users = Array.from(byId.values());
    const available = !error && teams.length > 0;

    const searchUsers = (query: string, limit = 8): OrgUser[] => {
      const q = query.trim().toLowerCase();
      const pool = users.filter((u) => u.email);
      const matches = q
        ? pool.filter(
            (u) =>
              u.email.toLowerCase().includes(q) ||
              [u.firstName, u.lastName]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(q)
          )
        : pool;
      return matches.slice(0, limit);
    };

    const isMemberOfTeam = (
      teamId: string,
      userId: string | undefined = currentUserId ?? undefined
    ): boolean => {
      if (!userId) return false;
      const team = teams.find((t) => t.id === teamId);
      return Boolean(team?.members.some((m) => m.id === userId));
    };

    return {
      loading,
      error,
      available,
      orgId: owner?.id ?? null,
      orgName: owner?.name ?? null,
      teams,
      users,
      searchUsers,
      isMemberOfTeam,
      currentUserId,
    };
  }, [data, error, loading, currentUserId]);

  return (
    <OrgDirectoryContext.Provider value={value}>
      {children}
    </OrgDirectoryContext.Provider>
  );
};
OrgDirectoryProvider.displayName = 'OrgDirectoryProvider';

/**
 * Access the cached organization directory. Must be used within
 * <OrgDirectoryProvider> (mounted in entry-point, inside <ApplicationShell>).
 */
export const useOrgDirectory = (): OrgDirectoryValue => {
  const ctx = useContext(OrgDirectoryContext);
  if (!ctx) {
    throw new Error(
      'useOrgDirectory must be used within an OrgDirectoryProvider'
    );
  }
  return ctx;
};

// Re-exported for callers that only need the display name of a user.
export const orgUserName = (u: OrgUser): string =>
  fullName(u as RawMember) || u.email;
