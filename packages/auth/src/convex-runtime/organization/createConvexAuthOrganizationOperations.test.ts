import assert from "node:assert/strict";

import { getFunctionName } from "convex/server";
import { describe, it } from "vitest";

import { api as componentApi } from "../../component/_generated/api";
import type { Id } from "../../component/_generated/dataModel";
import type { ComponentApi as FullComponentApi } from "../../component/_generated/component";
import type { ComponentApi as ApiKeysComponentApi } from "../../component/apiKeys/_generated/component";
import type { ComponentApi as CoreComponentApi } from "../../component/core/_generated/component";
import type { ComponentApi as OrganizationsComponentApi } from "../../component/organizations/_generated/component";
import type { GlueCtx } from "../glue/types";
import {
  createConvexAuthOrganizationOperations,
  ConvexAuthOrganizationOperationsError,
  type ResolvedComponentInvitation,
  type ResolvedComponentMembership,
  type ConvexAuthOrganizationOperationsComponentHandle,
  type ConvexAuthOrganizationOperationsComponentsHandle,
  type ConvexAuthOrganizationOperationsConfig,
} from "./createConvexAuthOrganizationOperations";

// Compile-time check that the legacy full component satisfies the operations
// handle, so existing consumers do not break.
type _AssertFullComponentSatisfiesHandle =
  FullComponentApi<"convexAuth"> extends ConvexAuthOrganizationOperationsComponentHandle
    ? true
    : false;

// Compile-time checks that the split `components` bag can be satisfied by the
// feature-gated components.
type _AssertCoreSatisfiesComponentsCore =
  CoreComponentApi<"convexAuthCore"> extends ConvexAuthOrganizationOperationsComponentsHandle["core"]
    ? true
    : false;
type _AssertOrganizationsSatisfiesComponentsOrganizations =
  OrganizationsComponentApi<"convexAuthOrganizations"> extends ConvexAuthOrganizationOperationsComponentsHandle["organizations"]
    ? true
    : false;
type _AssertApiKeysSatisfiesComponentsApiKeys =
  ApiKeysComponentApi<"convexAuthApiKeys">["apiKeys"] extends ConvexAuthOrganizationOperationsComponentsHandle["apiKeys"]
    ? true
    : false;

// ---------------------------------------------------------------------------
// Test domain: branded local ids + a fixed role-template literal union.
// ---------------------------------------------------------------------------

type LocalOrgId = string & { readonly __brand: "LocalOrgId" };
type LocalUserId = string & { readonly __brand: "LocalUserId" };
type TestRole = "owner" | "admin" | "member";

const TEST_ROLE_CATALOG: Readonly<Record<TestRole, readonly string[]>> = {
  owner: ["*"],
  admin: ["org:read", "org:members:manage"],
  member: ["org:read"],
};

function isTestRole(key: string): key is TestRole {
  return key === "owner" || key === "admin" || key === "member";
}

function orgId(value: string): LocalOrgId {
  if (!isLocalOrgId(value)) throw new TypeError("invalid local organization id");
  return value;
}
function userId(value: string): LocalUserId {
  if (!isLocalUserId(value)) throw new TypeError("invalid local user id");
  return value;
}
function isLocalOrgId(value: string): value is LocalOrgId {
  return value.startsWith("local-org");
}
function isLocalUserId(value: string): value is LocalUserId {
  return value.startsWith("local-user");
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}
function componentId<
  TableName extends
    | "users"
    | "organizations"
    | "organization_members"
    | "organization_roles"
    | "organization_invitations"
    | "api_keys",
>(tableName: TableName, value: string): Id<TableName> {
  if (!isFixtureId(tableName, value)) {
    throw new TypeError(`invalid ${tableName} fixture id`);
  }
  return value;
}

function isFixtureId<
  TableName extends
    | "users"
    | "organizations"
    | "organization_members"
    | "organization_roles"
    | "organization_invitations"
    | "api_keys",
>(_tableName: TableName, value: string): value is Id<TableName> {
  return value.length > 0;
}

// ---------------------------------------------------------------------------
// Fake component handle: each op is a unique marker object. The fake
// runQuery/runMutation dispatch off identity of the marker.
// ---------------------------------------------------------------------------

const operationRefs = {
  // organizations
  getMember: componentApi.organizations.getMember,
  getMemberByIdForSystem: componentApi.organizations.getMemberByIdForSystem,
  getMemberByUserOrganization: componentApi.organizations.getMemberByUserOrganization,
  listMembersByOrganization: componentApi.organizations.listMembersByOrganization,
  listMembershipsByUser: componentApi.organizations.listMembershipsByUser,
  getRole: componentApi.organizations.getRole,
  getRoleByKey: componentApi.organizations.getRoleByKey,
  listRolesByOrganization: componentApi.organizations.listRolesByOrganization,
  upsertOrganization: componentApi.organizations.upsertOrganization,
  upsertMember: componentApi.organizations.upsertMember,
  seedDefaultRoles: componentApi.organizations.seedDefaultRoles,
  ensureRole: componentApi.organizations.ensureRole,
  upsertInvitation: componentApi.organizations.upsertInvitation,
  setInvitationStatus: componentApi.organizations.setInvitationStatus,
  recordInvitationEmailDelivery: componentApi.organizations.recordInvitationEmailDelivery,
  getInvitationByTokenHash: componentApi.organizations.getInvitationByTokenHash,
  getInvitationByEmailId: componentApi.organizations.getInvitationByEmailId,
  listInvitationsByOrganization: componentApi.organizations.listInvitationsByOrganization,
  // apiKeys
  getApiKey: componentApi.apiKeys.getApiKey,
  getApiKeyByPrefix: componentApi.apiKeys.getApiKeyByPrefix,
  getApiKeyByRequestId: componentApi.apiKeys.getApiKeyByRequestId,
  listApiKeysByOrganization: componentApi.apiKeys.listApiKeysByOrganization,
  upsertApiKey: componentApi.apiKeys.upsertApiKey,
  rotateApiKey: componentApi.apiKeys.rotateApiKey,
  revokeApiKey: componentApi.apiKeys.revokeApiKey,
  touchApiKeyLastUsed: componentApi.apiKeys.touchApiKeyLastUsed,
};

function memberRowsForStatus(status: "active" | "invited" | "suspended") {
  return [
    {
      _id: `m-${status}`,
      organizationId: "cOrg1",
      userId: "cUser1",
      roleId: "r1",
      status,
      createdAt: 1,
      updatedAt: 1,
    },
  ];
}

const fakeComponent: ConvexAuthOrganizationOperationsComponentHandle = {
  identity: { getByIdentity: componentApi.identity.getByIdentity },
  organizations: {
    getMemberByUserOrganization: operationRefs.getMemberByUserOrganization,
    listMembersByOrganization: operationRefs.listMembersByOrganization,
    listMembershipsByUser: operationRefs.listMembershipsByUser,
    getRole: operationRefs.getRole,
    getRoleByKey: operationRefs.getRoleByKey,
    upsertOrganization: operationRefs.upsertOrganization,
    upsertMember: operationRefs.upsertMember,
    seedDefaultRoles: operationRefs.seedDefaultRoles,
    getMember: operationRefs.getMember,
    getMemberByIdForSystem: operationRefs.getMemberByIdForSystem,
    listRolesByOrganization: operationRefs.listRolesByOrganization,
    ensureRole: operationRefs.ensureRole,
    upsertInvitation: operationRefs.upsertInvitation,
    setInvitationStatus: operationRefs.setInvitationStatus,
    recordInvitationEmailDelivery: operationRefs.recordInvitationEmailDelivery,
    getInvitationByTokenHash: operationRefs.getInvitationByTokenHash,
    getInvitationByEmailId: operationRefs.getInvitationByEmailId,
    listInvitationsByOrganization: operationRefs.listInvitationsByOrganization,
  },
  apiKeys: {
    getApiKey: operationRefs.getApiKey,
    getApiKeyByPrefix: operationRefs.getApiKeyByPrefix,
    getApiKeyByRequestId: operationRefs.getApiKeyByRequestId,
    listApiKeysByOrganization: operationRefs.listApiKeysByOrganization,
    upsertApiKey: operationRefs.upsertApiKey,
    rotateApiKey: operationRefs.rotateApiKey,
    revokeApiKey: operationRefs.revokeApiKey,
    touchApiKeyLastUsed: operationRefs.touchApiKeyLastUsed,
  },
};

// ---------------------------------------------------------------------------
// Fake world: component-side rows + local anchors + a query/mutation log.
// ---------------------------------------------------------------------------

type Roles = Record<string, { key: string }>;
type Members = Record<
  string,
  {
    _id: string;
    organizationId: string;
    userId?: string | null;
    roleId: string;
    status: "active" | "invited" | "suspended";
    createdAt: number;
    updatedAt: number;
  }
>;

type World = {
  roles: Roles;
  members: Members;
  // component-org-id → local-org-id anchors
  orgAnchors: Record<string, LocalOrgId>;
  // component-user-id → local-user-id anchors
  userAnchors: Record<string, LocalUserId>;
  mutationLog: Array<{ op: string; args: unknown }>;
};

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    roles: {},
    members: {},
    orgAnchors: {},
    userAnchors: {},
    mutationLog: [],
    ...overrides,
  };
}

function makeCtx(
  world: World,
  responders: {
    query?: Record<string, (args: Record<string, unknown>) => unknown>;
    mutation?: Record<string, (args: Record<string, unknown>) => unknown>;
  } = {},
  options: { withMutation?: boolean } = { withMutation: true },
): GlueCtx {
  const dispatchQuery = (
    marker: Parameters<GlueCtx["runQuery"]>[0],
    args: Record<string, unknown>,
  ): unknown => {
    const name = getFunctionName(marker).split(":").at(-1);
    if (name === "getRole") {
      const role = world.roles[String(args.roleId)];
      return role ? { _id: args.roleId, key: role.key } : null;
    }
    const responder = name === undefined ? undefined : responders.query?.[name];
    if (responder) {
      return responder(args);
    }
    throw new Error(`unexpected query op: ${name}`);
  };

  const ctx: GlueCtx = {
    auth: { getUserIdentity: async () => null },
    runQuery: async (marker, ...runArgs) => dispatchQuery(marker, runArgs[0] ?? {}),
  };

  if (options.withMutation !== false) {
    ctx.runMutation = async (marker, ...runArgs) => {
      const args = (runArgs[0] ?? {}) as Record<string, unknown>;
      const name = getFunctionName(marker).split(":").at(-1) ?? "unknown";
      world.mutationLog.push({ op: name, args });
      const responder = responders.mutation?.[name];
      if (responder) {
        return responder(args ?? {});
      }
      return undefined;
    };
  }

  return ctx;
}

function makeOperations(
  world: World,
  overrides: Partial<
    ConvexAuthOrganizationOperationsConfig<LocalOrgId, LocalUserId, TestRole>
  > = {},
) {
  return createConvexAuthOrganizationOperations<LocalOrgId, LocalUserId, TestRole>({
    component: fakeComponent,
    resolveLocalOrganizationId: async (_ctx, componentOrganizationId) =>
      world.orgAnchors[componentOrganizationId] ?? null,
    resolveLocalUserId: async (_ctx, componentUserId) => world.userAnchors[componentUserId] ?? null,
    validateRoleKey: isTestRole,
    roleCatalog: TEST_ROLE_CATALOG,
    loadOrganizationForUpsert: async (_ctx, localOrganizationId) => {
      // find the component org id whose anchor is this local org
      const entry = Object.entries(world.orgAnchors).find(
        ([, local]) => local === localOrganizationId,
      );
      return {
        convexAuthOrganizationId:
          entry === undefined ? undefined : componentId("organizations", entry[0]),
        name: `org-${localOrganizationId}`,
        slug: `slug-${localOrganizationId}`,
        imageUrl: null,
        status: "active",
        metadataJson: null,
      };
    },
    backfillOrganizationBridgeId: async (_ctx, localOrganizationId, componentOrganizationId) => {
      world.orgAnchors[componentOrganizationId] = localOrganizationId;
    },
    loadUserBridgeId: async (_ctx, localUserId) => {
      const entry = Object.entries(world.userAnchors).find(([, local]) => local === localUserId);
      return entry === undefined ? null : componentId("users", entry[0]);
    },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// READER SAFETY
// ---------------------------------------------------------------------------

describe("createConvexAuthOrganizationOperations — reader safety", () => {
  it("DROPS a member whose role key is not a valid consumer template", async () => {
    const world = makeWorld({
      roles: {
        roleGood: { key: "admin" },
        roleBogus: { key: "super-saiyan" }, // not a TestRole
      },
      orgAnchors: { cOrg1: orgId("local-org-1") },
      members: {},
    });
    const memberRows = [
      {
        _id: "m1",
        organizationId: "cOrg1",
        userId: "cUser1",
        roleId: "roleGood",
        status: "active" as const,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: "m2",
        organizationId: "cOrg1",
        userId: "cUser2",
        roleId: "roleBogus",
        status: "active" as const,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const ctx = makeCtx(world, {
      query: { listMembershipsByUser: () => memberRows },
    });
    const ops = makeOperations(world);
    const memberships = await ops.reads.resolveMemberships(ctx, componentId("users", "cUser1"));
    assert.equal(memberships.length, 1, "bogus-role member must be dropped");
    assert.equal(memberships[0]?.roleTemplate, "admin");
    assert.equal(memberships[0]?.convexAuthMemberId, "m1");
  });

  it("DROPS a member whose org has no local anchor (returns null, no fabrication)", async () => {
    const world = makeWorld({
      roles: { r1: { key: "member" } },
      orgAnchors: {}, // no anchor for cOrgX
    });
    const ctx = makeCtx(world, {
      query: {
        listMembershipsByUser: () => [
          {
            _id: "m1",
            organizationId: "cOrgX",
            userId: "cUser1",
            roleId: "r1",
            status: "active" as const,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    });
    const ops = makeOperations(world);
    const memberships = await ops.reads.resolveMemberships(ctx, componentId("users", "cUser1"));
    assert.deepEqual(memberships, []);
  });

  it("maps status: invited → pending, suspended → suspended, active → active", async () => {
    const world = makeWorld({
      roles: { r1: { key: "member" } },
      orgAnchors: { cOrg1: orgId("local-org-1") },
    });
    const expected: Record<string, string> = {
      active: "active",
      invited: "pending",
      suspended: "suspended",
    };
    await Promise.all(
      (["active", "invited", "suspended"] as const).map(async (status) => {
        const ctx = makeCtx(world, {
          query: { listMembershipsByUser: () => memberRowsForStatus(status) },
        });
        const ops = makeOperations(world);
        const memberships = await ops.reads.resolveMemberships(ctx, componentId("users", "cUser1"));
        assert.equal(memberships[0]?.status, expected[status], `status ${status}`);
      }),
    );
  });

  it("listMembersByOrganization: userId is null when the user has no local anchor", async () => {
    const world = makeWorld({
      roles: { r1: { key: "member" } },
      orgAnchors: { cOrg1: orgId("local-org-1") },
      userAnchors: {}, // no user anchor
    });
    const ctx = makeCtx(world, {
      query: {
        listMembersByOrganization: () => [
          {
            _id: "m1",
            organizationId: "cOrg1",
            userId: "cUserUnknown",
            roleId: "r1",
            status: "active" as const,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    });
    const ops = makeOperations(world);
    const members = await ops.reads.listMembersByOrganization(
      ctx,
      componentId("organizations", "cOrg1"),
    );
    assert.equal(members.length, 1);
    assert.equal(members[0]?.userId, null);
    assert.equal(members[0]?.roleTemplate, "member");
  });

  it("drops an invitation whose inviter has no local anchor", async () => {
    const world = makeWorld({
      roles: { r1: { key: "admin" } },
      orgAnchors: { cOrg1: orgId("local-org-1") },
      userAnchors: {}, // inviter cannot be mapped
    });
    const ctx = makeCtx(world, {
      query: {
        listInvitationsByOrganization: () => [
          {
            _id: "inv1",
            organizationId: "cOrg1",
            roleId: "r1",
            email: "a@b.com",
            tokenHash: "hash",
            status: "pending" as const,
            invitedBy: "cInviter",
            expiresAt: 1000,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    });
    const ops = makeOperations(world);
    const invitations = await ops.reads.listInvitationsByOrganization(ctx, {
      convexAuthOrganizationId: componentId("organizations", "cOrg1"),
    });
    assert.deepEqual(invitations, []);
  });
});

// ---------------------------------------------------------------------------
// WRITER ENSURE-CHAIN
// ---------------------------------------------------------------------------

describe("createConvexAuthOrganizationOperations — writer ensure-chain", () => {
  it("upsertMember ensures org→role, backfills a NEW component org id, resolves optional invitedBy", async () => {
    // The local org has NO bridge yet; upsertOrganization returns a fresh id we
    // expect to be backfilled onto the local anchor.
    const world = makeWorld({
      orgAnchors: {}, // no bridge yet
      userAnchors: {
        cUserMain: userId("local-user-main"),
        cInviter: userId("local-user-inviter"),
      },
    });
    const ctx = makeCtx(world, {
      mutation: {
        upsertOrganization: () => ({ organizationId: "cOrgNew" }),
        ensureRole: () => ({ roleId: "cRoleNew" }),
        upsertMember: () => ({ memberId: "cMemberNew" }),
      },
    });
    const ops = makeOperations(world);
    const memberId = await ops.writes.upsertMember(ctx, {
      localOrganizationId: orgId("local-org-1"),
      localUserId: userId("local-user-main"),
      roleTemplate: "admin",
      status: "active",
      invitedBy: userId("local-user-inviter"),
    });

    assert.equal(memberId, "cMemberNew");

    // backfill happened: the component org id is now anchored to the local org.
    assert.equal(world.orgAnchors.cOrgNew, orgId("local-org-1"));

    // ensure-chain order: upsertOrganization, then ensureRole, then upsertMember.
    const opOrder = world.mutationLog.map((m) => m.op);
    const orgIdx = opOrder.indexOf("upsertOrganization");
    const roleIdx = opOrder.indexOf("ensureRole");
    const memberIdx = opOrder.indexOf("upsertMember");
    assert.ok(
      orgIdx >= 0 && roleIdx > orgIdx && memberIdx > roleIdx,
      "ensure order org→role→member",
    );

    // upsertMember received the resolved component bridge ids, not local ids.
    const upsertMemberArgs = requireRecord(
      world.mutationLog.find((m) => m.op === "upsertMember")?.args,
    );
    assert.equal(upsertMemberArgs.organizationId, "cOrgNew");
    assert.equal(upsertMemberArgs.userId, "cUserMain");
    assert.equal(upsertMemberArgs.roleId, "cRoleNew");
    assert.equal(upsertMemberArgs.invitedBy, "cInviter");
  });

  it("upsertMember throws when the member user has no bridge id", async () => {
    const world = makeWorld({ userAnchors: {} });
    const ctx = makeCtx(world, {
      mutation: {
        upsertOrganization: () => ({ organizationId: "cOrgNew" }),
        ensureRole: () => ({ roleId: "cRoleNew" }),
        upsertMember: () => ({ memberId: "cMemberNew" }),
      },
    });
    const ops = makeOperations(world);
    await assert.rejects(
      ops.writes.upsertMember(ctx, {
        localOrganizationId: orgId("local-org-1"),
        localUserId: userId("local-user-orphan"),
        roleTemplate: "member",
        status: "active",
      }),
      /missing convex auth bridge id/,
    );
  });

  it("ensureSystemRoles seeds the role catalog permissions verbatim (not invented)", async () => {
    const world = makeWorld({ orgAnchors: { cOrg1: orgId("local-org-1") } });
    const ctx = makeCtx(world, {
      mutation: {
        upsertOrganization: () => ({ organizationId: "cOrg1" }),
        seedDefaultRoles: () => undefined,
      },
    });
    const ops = makeOperations(world);
    await ops.writes.ensureSystemRoles(ctx, orgId("local-org-1"));
    const seedArgs = requireRecord(
      world.mutationLog.find((m) => m.op === "seedDefaultRoles")?.args,
    );
    assert.ok(Array.isArray(seedArgs.catalog));
    const catalog = seedArgs.catalog.map(requireRecord);
    const byKey = Object.fromEntries(catalog.map((entry) => [entry.key, entry.permissions]));
    assert.deepEqual(byKey.owner, ["*"]);
    assert.deepEqual(byKey.admin, ["org:read", "org:members:manage"]);
    assert.deepEqual(byKey.member, ["org:read"]);
    for (const entry of catalog) {
      assert.equal(entry.isSystem, true);
    }
  });

  it("ensureRoleForTemplate seeds the template's catalog permissions", async () => {
    const world = makeWorld({ orgAnchors: { cOrg1: orgId("local-org-1") } });
    const ctx = makeCtx(world, {
      mutation: {
        upsertOrganization: () => ({ organizationId: "cOrg1" }),
        ensureRole: () => ({ roleId: "cRoleAdmin" }),
      },
    });
    const ops = makeOperations(world);
    const roleId = await ops.writes.ensureRoleForTemplate(ctx, orgId("local-org-1"), "admin");
    assert.equal(roleId, "cRoleAdmin");
    const ensureArgs = requireRecord(world.mutationLog.find((m) => m.op === "ensureRole")?.args);
    assert.equal(ensureArgs.key, "admin");
    assert.deepEqual(ensureArgs.permissions, ["org:read", "org:members:manage"]);
  });

  it("does NOT backfill when the component returns the SAME org id already anchored", async () => {
    const world = makeWorld({ orgAnchors: { cOrg1: orgId("local-org-1") } });
    const ctx = makeCtx(world, {
      mutation: { upsertOrganization: () => ({ organizationId: "cOrg1" }) },
    });
    const ops = makeOperations(world);
    await ops.writes.ensureOrganization(ctx, orgId("local-org-1"));
    // anchor unchanged; only one component org id mapping exists.
    assert.deepEqual(Object.keys(world.orgAnchors), ["cOrg1"]);
  });

  it("writer throws when ctx has no runMutation", async () => {
    const world = makeWorld({ orgAnchors: { cOrg1: orgId("local-org-1") } });
    const ctx = makeCtx(world, {}, { withMutation: false });
    const ops = makeOperations(world);
    await assert.rejects(
      ops.writes.ensureOrganization(ctx, orgId("local-org-1")),
      /no runMutation/,
    );
  });
});

// ---------------------------------------------------------------------------
// COMPILE-TIME TYPE ASSERTIONS — DTOs carry branded ids / role union, not string
// ---------------------------------------------------------------------------

describe("createConvexAuthOrganizationOperations — generics flow branded ids", () => {
  it("read DTOs carry the consumer's branded id + role types (compile-time)", () => {
    type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

    type Membership = ResolvedComponentMembership<LocalOrgId, TestRole>;
    // organizationId is the branded LocalOrgId, NOT string.
    type TypeProofs = [
      Equals<Membership["organizationId"], LocalOrgId>,
      Equals<Membership["organizationId"] extends string ? true : false, true>,
      Equals<Membership["roleTemplate"], TestRole>,
      Equals<
        ResolvedComponentInvitation<LocalOrgId, LocalUserId, TestRole>["invitedBy"],
        LocalUserId
      >,
      Equals<
        ResolvedComponentInvitation<LocalOrgId, LocalUserId, TestRole>["organizationId"],
        LocalOrgId
      >,
    ];
    const typeProofs: TypeProofs = [true, true, true, true, true];
    assert.deepEqual(typeProofs, [true, true, true, true, true]);
    // and NOT loosely string:
    const isNotString: Equals<Membership["organizationId"], string> = false;
    assert.equal(isNotString, false);
    // roleTemplate and invitation ids are proven by TypeProofs above.
  });
});

// ---------------------------------------------------------------------------
// ERROR POLICY (typed default + consumer createError seam)
// ---------------------------------------------------------------------------

describe("createConvexAuthOrganizationOperations — error policy", () => {
  it("throws a typed ConvexAuthOrganizationOperationsError (never a bare Error) for a writer with no runMutation", async () => {
    const world = makeWorld({ orgAnchors: { "comp-org": orgId("local-org") } });
    const ops = makeOperations(world);
    const queryOnlyCtx = makeCtx(world, {}, { withMutation: false });

    await assert.rejects(
      () => ops.writes.ensureOrganization(queryOnlyCtx, orgId("local-org")),
      (error: unknown) => {
        assert.ok(
          error instanceof ConvexAuthOrganizationOperationsError,
          "must be the typed package error, not a bare Error",
        );
        assert.equal(error.code, "missing_run_mutation");
        return true;
      },
    );
  });

  it("throws user_bridge_id_missing with subject context when a member has no bridge id", async () => {
    const world = makeWorld({ orgAnchors: { "comp-org": orgId("local-org") } });
    const ops = makeOperations(world);
    const ctx = makeCtx(world);

    await assert.rejects(
      () =>
        ops.writes.upsertMember(ctx, {
          localOrganizationId: orgId("local-org"),
          localUserId: userId("local-user-no-bridge"),
          roleTemplate: "member",
          status: "active",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ConvexAuthOrganizationOperationsError);
        assert.equal(error.code, "user_bridge_id_missing");
        assert.equal(error.context?.subject, "member");
        assert.equal(error.context?.localUserId, "local-user-no-bridge");
        return true;
      },
    );
  });

  it("throws organization_not_found with org context when loadOrganizationForUpsert returns null", async () => {
    const world = makeWorld();
    const ops = makeOperations(world, {
      loadOrganizationForUpsert: async () => null,
    });
    const ctx = makeCtx(world);

    await assert.rejects(
      () => ops.writes.ensureOrganization(ctx, orgId("local-org")),
      (error: unknown) => {
        assert.ok(error instanceof ConvexAuthOrganizationOperationsError);
        assert.equal(error.code, "organization_not_found");
        assert.equal(error.context?.localOrganizationId, "local-org");
        return true;
      },
    );
  });

  it("throws the CONSUMER's own error when createError is supplied (consumer-clean, no catch/remap)", async () => {
    // A stand-in for a consumer's ConvexError({ code, message }).
    class FakeConvexError extends Error {
      readonly data: { code: string; message: string };
      constructor(data: { code: string; message: string }) {
        super(data.message);
        this.name = "FakeConvexError";
        this.data = data;
      }
    }

    const world = makeWorld({ orgAnchors: { "comp-org": orgId("local-org") } });
    let received: { code: string } | null = null;
    const ops = makeOperations(world, {
      createError: ({ code, message }) => {
        received = { code };
        return new FakeConvexError({ code, message });
      },
    });
    const ctx = makeCtx(world);

    await assert.rejects(
      () =>
        ops.writes.upsertMember(ctx, {
          localOrganizationId: orgId("local-org"),
          localUserId: userId("local-user-no-bridge"),
          roleTemplate: "member",
          status: "active",
        }),
      (error: unknown) => {
        // The consumer's error is thrown directly — NOT the package default.
        assert.ok(error instanceof FakeConvexError);
        assert.ok(!(error instanceof ConvexAuthOrganizationOperationsError));
        assert.equal(error.data.code, "user_bridge_id_missing");
        return true;
      },
    );
    assert.deepEqual(received, { code: "user_bridge_id_missing" });
  });
});
