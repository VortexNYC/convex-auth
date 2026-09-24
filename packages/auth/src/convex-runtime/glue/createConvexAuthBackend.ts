import { createConvexAuthGlue } from "./createConvexAuthGlue";
import type {
  B2BGlue,
  B2BModeAdapters,
  GlueAnchorMinimum,
  GlueCtx,
  GlueUserMinimum,
  ConvexAuthComponentHandle,
} from "./types";

/**
 * Build the standard B2B adapters from storage names instead of hand-writing
 * them in every consumer.
 *
 * Why this exists: `createConvexAuthGlue` takes five adapter callbacks, four of
 * which are pure, derivable index operations. Every consumer wrote them by
 * hand from a copied example, which produced five drifted copies (66-292
 * lines) and — worse — propagated a contract violation: two of them re-resolve
 * `ctx.auth.getUserIdentity()` inside `findUserByConvexAuthUserId`, which the
 * adapter contract explicitly forbids because the glue has ALREADY performed
 * that resolution and passes the authoritative id as the second argument.
 *
 * Core generating those adapters makes that class of mistake unwritable.
 *
 * The only genuinely consumer-specific adapter is `insertAnchor`, because each
 * consumer's organizations table has different required columns — that stays a
 * hook (`buildOrganization`).
 */

/**
 * Minimal structural views of the Convex database.
 *
 * `GlueCtx.db` is `unknown` by design: the glue cannot know the consumer's
 * DataModel. These are the narrowest shapes the generated adapters actually
 * use, paired with real runtime guards below — no casts, no `any`.
 */

type IndexRangeBuilder = {
  eq: (field: string, value: unknown) => IndexRangeBuilder;
};

type QueryBuilder = {
  withIndex: (
    indexName: string,
    range: (q: IndexRangeBuilder) => IndexRangeBuilder,
  ) => { unique: () => Promise<unknown> };
};

type QueryDatabase = { query: (table: string) => QueryBuilder };

type MutationDatabase = QueryDatabase & {
  insert: (table: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (table: string, id: unknown) => Promise<unknown>;
  patch: (table: string, id: unknown, value: Record<string, unknown>) => Promise<void>;
  normalizeId: (table: string, id: string) => unknown;
};

function hasQueryDatabase(ctx: GlueCtx): ctx is GlueCtx & { db: QueryDatabase } {
  return (
    typeof ctx.db === "object" &&
    ctx.db !== null &&
    typeof Reflect.get(ctx.db, "query") === "function"
  );
}

function hasMutationDatabase(ctx: GlueCtx): ctx is GlueCtx & { db: MutationDatabase } {
  if (!hasQueryDatabase(ctx)) return false;
  const db: object = ctx.db;
  return (
    typeof Reflect.get(db, "insert") === "function" &&
    typeof Reflect.get(db, "get") === "function" &&
    typeof Reflect.get(db, "patch") === "function"
  );
}

function requireQueryDatabase(ctx: GlueCtx): QueryDatabase {
  if (!hasQueryDatabase(ctx)) {
    throw new TypeError(
      "createConvexAuthBackend: adapter requires a Convex query database on ctx.db",
    );
  }
  return ctx.db;
}

export type ConvexAuthBackendStorage = {
  /** Local users table. Defaults to `"users"`. */
  usersTable?: string;
  /** Local organizations anchor table. Defaults to `"organizations"`. */
  organizationsTable?: string;
  /** Index on `users.convexAuthUserId`. Defaults to `"by_convex_auth_user"`. */
  usersByConvexAuthUserIdIndex?: string;
  /**
   * Index on `organizations.convexAuthOrganizationId`.
   * Defaults to `"by_convex_auth_organization"`.
   */
  organizationsByConvexAuthOrganizationIdIndex?: string;
};

export type BuildOrganizationArgs = {
  convexAuthOrganizationId: string;
  name: string;
  createdByConvexAuthUserId: string;
};

export type ConvexAuthBackendAdaptersConfig<
  TUser extends GlueUserMinimum = GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum = GlueAnchorMinimum,
> = {
  storage?: ConvexAuthBackendStorage;

  /**
   * The one genuinely consumer-specific adapter. The glue supplies the
   * canonical fields it owns; return the full row to insert, including your
   * own required columns (slug, status, plan, timestamps, ...).
   */
  buildOrganization: (args: BuildOrganizationArgs) => Record<string, unknown>;

  /** Role key -> concrete permissions. Omit to use the component's raw list. */
  expandPermissions?: (roleKey: string, permissions: readonly string[]) => readonly string[];

  /**
   * Row guards, required.
   *
   * The generated adapters read through `GlueCtx.db`, which is `unknown` —
   * the glue cannot see your DataModel. A guard is the only way to get your
   * row type back without a cast, and it is a real runtime check rather than
   * an unchecked assumption about what the index returned.
   *
   *   isUser: (row): row is Doc<"users"> =>
   *     typeof row === "object" && row !== null && "email" in row,
   */
  isUser: (row: unknown) => row is TUser;
  isAnchor: (row: unknown) => row is TAnchor;

  /**
   * Defaults match what every B2B consumer already sets by hand:
   * invited users do NOT get an auto-minted personal org.
   */
  invitedUsersGetPersonalOrg?: boolean;
  /** Defaults to the legacy provider key. */
  identityProvider?: string;
};

export type CreateConvexAuthBackendConfig<
  TUser extends GlueUserMinimum = GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum = GlueAnchorMinimum,
> = ConvexAuthBackendAdaptersConfig<TUser, TAnchor> & {
  component: ConvexAuthComponentHandle;
};

export function createConvexAuthBackendAdapters<
  TUser extends GlueUserMinimum = GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum = GlueAnchorMinimum,
>(config: ConvexAuthBackendAdaptersConfig<TUser, TAnchor>): B2BModeAdapters<TUser, TAnchor> {
  const usersTable = config.storage?.usersTable ?? "users";
  const organizationsTable = config.storage?.organizationsTable ?? "organizations";
  const usersIndex = config.storage?.usersByConvexAuthUserIdIndex ?? "by_convex_auth_user";
  const organizationsIndex =
    config.storage?.organizationsByConvexAuthOrganizationIdIndex ?? "by_convex_auth_organization";

  const { isUser, isAnchor } = config;

  function narrowUser(row: unknown): TUser | null {
    return isUser(row) ? row : null;
  }

  function narrowAnchor(row: unknown): TAnchor | null {
    return isAnchor(row) ? row : null;
  }

  return {
    /**
     * A PURE index lookup on the id the glue already resolved. Deliberately
     * does not touch ctx.auth — see the contract note on the adapter type.
     */
    findUserByConvexAuthUserId: async (
      ctx: GlueCtx,
      convexAuthUserId: string,
    ): Promise<TUser | null> => {
      const db = requireQueryDatabase(ctx);
      const row = await db
        .query(usersTable)
        .withIndex(usersIndex, (q) => q.eq("convexAuthUserId", convexAuthUserId))
        .unique();
      return narrowUser(row);
    },

    findAnchorByConvexAuthOrganizationId: async (
      ctx: GlueCtx,
      convexAuthOrganizationId: string,
    ): Promise<TAnchor | null> => {
      const db = requireQueryDatabase(ctx);
      const row = await db
        .query(organizationsTable)
        .withIndex(organizationsIndex, (q) =>
          q.eq("convexAuthOrganizationId", convexAuthOrganizationId),
        )
        .unique();
      return narrowAnchor(row);
    },

    insertAnchor: async (ctx: GlueCtx, args: BuildOrganizationArgs): Promise<TAnchor> => {
      if (!hasMutationDatabase(ctx)) {
        throw new TypeError(
          "createConvexAuthBackend: insertAnchor needs a mutation database; retry via a mutation",
        );
      }
      const id = await ctx.db.insert(organizationsTable, config.buildOrganization(args));
      const row = await ctx.db.get(organizationsTable, id);
      const anchor = narrowAnchor(row);
      if (anchor === null) {
        throw new Error(
          "createConvexAuthBackend: inserted organization did not match the anchor shape; buildOrganization must set convexAuthOrganizationId",
        );
      }
      return anchor;
    },

    /**
     * Best-effort by contract: the glue's self-heal path may call this from a
     * read context. Skip silently there — the next mutation re-fires it.
     */
    setActiveOrganization: async (
      ctx: GlueCtx,
      user: TUser,
      convexAuthOrganizationId: string,
    ): Promise<void> => {
      if (!hasMutationDatabase(ctx)) return;
      const id = typeof user._id === "string" ? ctx.db.normalizeId(usersTable, user._id) : user._id;
      if (id === null || id === undefined) return;
      await ctx.db.patch(usersTable, id, {
        activeConvexAuthOrganizationId: convexAuthOrganizationId,
      });
    },

    ...(config.expandPermissions === undefined
      ? {}
      : { expandPermissions: config.expandPermissions }),
  };
}

/**
 * The whole B2B auth backend from one call. Replaces the hand-written
 * `lib/canonicalGlue.ts` that every consumer copies today.
 */
export function createConvexAuthBackend<
  TUser extends GlueUserMinimum = GlueUserMinimum,
  TAnchor extends GlueAnchorMinimum = GlueAnchorMinimum,
>(config: CreateConvexAuthBackendConfig<TUser, TAnchor>): B2BGlue<TUser, TAnchor> {
  return createConvexAuthGlue<TUser, TAnchor>({
    orgs: "enabled",
    component: config.component,
    adapters: createConvexAuthBackendAdapters(config),
    invitedUsersGetPersonalOrg: config.invitedUsersGetPersonalOrg ?? false,
    ...(config.identityProvider === undefined ? {} : { identityProvider: config.identityProvider }),
  });
}
