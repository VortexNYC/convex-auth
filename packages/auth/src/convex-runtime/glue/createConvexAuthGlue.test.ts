import assert from "node:assert/strict";

import { permissionMatcherConformanceCases } from "../../compat/permissions";
import { getFunctionName } from "convex/server";
import { describe, it } from "vitest";

import { api as componentApi } from "../../component/_generated/api";
import type { Id } from "../../component/_generated/dataModel";
import { createConvexAuthGlue } from "./createConvexAuthGlue";
import { isAuthErrorPayload } from "./throwAuthError";
import type { B2BModeAdapters, GlueCtx, ConvexAuthComponentHandle } from "./types";

function componentId<TableName extends "users" | "organizations" | "organization_members">(
  tableName: TableName,
  value: string,
): Id<TableName> {
  if (!isFixtureId(tableName, value)) {
    throw new TypeError(`invalid ${tableName} fixture id`);
  }
  return value;
}

function isFixtureId<TableName extends "users" | "organizations" | "organization_members">(
  _tableName: TableName,
  value: string,
): value is Id<TableName> {
  return value.length > 0;
}

// ---------------------------------------------------------------------------
// Fakes. The glue is pure IO orchestration; we mock the surfaces it depends
// on so the tests stay tight and platform-free.
// ---------------------------------------------------------------------------

type FakeUser = {
  _id: string;
  convexAuthUserId?: string;
  activeConvexAuthOrganizationId?: string;
};
type FakeAnchor = {
  _id: string;
  convexAuthOrganizationId: string;
};

type ComponentState = {
  identities: Map<string, { userId: string; subject: string }>;
  members: Array<{
    _id: string;
    organizationId: string;
    userId: string;
    roleId: string;
    status: "active" | "invited" | "suspended";
  }>;
  roles: Map<string, { _id: string; organizationId: string; key: string; permissions: string[] }>;
  orgs: Map<string, { _id: string; name: string }>;
};

function makeComponent(): {
  handle: ConvexAuthComponentHandle;
  state: ComponentState;
} {
  const state: ComponentState = {
    identities: new Map(),
    members: [],
    roles: new Map(),
    orgs: new Map(),
  };
  // Sentinel keys so the test "FunctionReference" handles route to the
  // right fake. The runQuery dispatcher checks the key.
  const handle: ConvexAuthComponentHandle = {
    identity: { getByIdentity: componentApi.identity.getByIdentity },
    organizations: {
      getMemberByUserOrganization: componentApi.organizations.getMemberByUserOrganization,
      listMembersByOrganization: componentApi.organizations.listMembersByOrganization,
      listMembershipsByUser: componentApi.organizations.listMembershipsByUser,
      getRole: componentApi.organizations.getRole,
      getRoleByKey: componentApi.organizations.getRoleByKey,
      upsertOrganization: componentApi.organizations.upsertOrganization,
      upsertMember: componentApi.organizations.upsertMember,
      seedDefaultRoles: componentApi.organizations.seedDefaultRoles,
    },
  };
  return { handle, state };
}

function makeCtx(args: {
  identity: {
    subject: string;
    issuer: string;
    email?: string;
    name?: string;
  } | null;
  component: ComponentState;
}): GlueCtx {
  const state = args.component;
  const runQuery: GlueCtx["runQuery"] = async (ref, ...runArgs): Promise<unknown> => {
    const p = (runArgs[0] ?? {}) as Record<string, unknown>;
    const functionName = getFunctionName(ref);
    switch (functionName) {
      case "identity:getByIdentity": {
        return state.identities.get(String(p.subject)) ?? null;
      }
      case "organizations:getMemberByUserOrganization": {
        return (
          state.members.find(
            (m) => m.organizationId === p.organizationId && m.userId === p.userId,
          ) ?? null
        );
      }
      case "organizations:listMembersByOrganization": {
        return state.members.filter((m) => m.organizationId === p.organizationId);
      }
      case "organizations:listMembershipsByUser": {
        return state.members.filter((m) => m.userId === p.userId);
      }
      case "organizations:getRole": {
        return state.roles.get(String(p.roleId)) ?? null;
      }
      case "organizations:getRoleByKey": {
        for (const r of state.roles.values()) {
          if (r.organizationId === p.organizationId && r.key === p.key) {
            return r;
          }
        }
        return null;
      }
      default:
        throw new Error(`unexpected query: ${functionName}`);
    }
  };
  const runMutation: NonNullable<GlueCtx["runMutation"]> = async (
    ref,
    ...runArgs
  ): Promise<unknown> => {
    const p = (runArgs[0] ?? {}) as Record<string, unknown>;
    const functionName = getFunctionName(ref);
    switch (functionName) {
      case "organizations:upsertOrganization": {
        const id = `org_${state.orgs.size + 1}`;
        state.orgs.set(id, { _id: id, name: String(p.name) });
        return { organizationId: id };
      }
      case "organizations:seedDefaultRoles": {
        const orgId = String(p.organizationId);
        // Seed a minimal catalog: owner only (enough for bootstrap tests).
        const roleId = `role_${orgId}_owner`;
        state.roles.set(roleId, {
          _id: roleId,
          organizationId: orgId,
          key: "owner",
          permissions: ["org:manage"],
        });
        return { ok: true };
      }
      case "organizations:upsertMember": {
        const memberId = `member_${state.members.length + 1}`;
        state.members.push({
          _id: memberId,
          organizationId: String(p.organizationId),
          userId: String(p.userId),
          roleId: String(p.roleId),
          status: p.status === "invited" || p.status === "suspended" ? p.status : "active",
        });
        return { memberId };
      }
      default:
        throw new Error(`unexpected mutation: ${functionName}`);
    }
  };
  return {
    auth: { getUserIdentity: async () => args.identity },
    runQuery,
    runMutation,
    // Mimic Convex MutationCtx — the ensureAnchor QueryCtx guard checks
    // for `db.insert` to short-circuit with a canonical ANCHOR_MISSING
    // rather than letting the adapter throw a raw TypeError. Tests that
    // want to simulate a QueryCtx override this by setting `ctx.db = {}`.
    db: {
      insert: async () => undefined,
      patch: async () => undefined,
      get: async () => null,
      query: () => ({
        withIndex: () => ({
          unique: async () => null,
          first: async () => null,
        }),
      }),
    },
  };
}

function makeAdapters(initialUsers: FakeUser[]): {
  adapters: B2BModeAdapters<FakeUser, FakeAnchor>;
  users: FakeUser[];
  anchors: FakeAnchor[];
} {
  const users = [...initialUsers];
  const anchors: FakeAnchor[] = [];
  const adapters: B2BModeAdapters<FakeUser, FakeAnchor> = {
    findUserByConvexAuthUserId: async (_ctx, id) =>
      users.find((u) => u.convexAuthUserId === id) ?? null,
    findAnchorByConvexAuthOrganizationId: async (_ctx, id) =>
      anchors.find((a) => a.convexAuthOrganizationId === id) ?? null,
    insertAnchor: async (_ctx, args2) => {
      const a: FakeAnchor = {
        _id: `anchor_${anchors.length + 1}`,
        convexAuthOrganizationId: args2.convexAuthOrganizationId,
      };
      anchors.push(a);
      return a;
    },
    setActiveOrganization: async (_ctx, user, orgId) => {
      const idx = users.findIndex((u) => u._id === user._id);
      if (idx >= 0) {
        const existing = users[idx];
        if (existing === undefined) {
          return;
        }
        users[idx] = { ...existing, activeConvexAuthOrganizationId: orgId };
      }
    },
  };
  return { adapters, users, anchors };
}

async function checkB2BViewerPermission(
  granted: readonly string[],
  required: string,
): Promise<boolean> {
  const { handle, state } = makeComponent();
  state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
  const orgId = componentId("organizations", "org_conformance");
  state.orgs.set(orgId, { _id: orgId, name: "Conformance" });
  state.roles.set("role_conformance", {
    _id: "role_conformance",
    organizationId: orgId,
    key: "member",
    permissions: [...granted],
  });
  state.members.push({
    _id: "member_conformance",
    organizationId: orgId,
    userId: "comp_user_1",
    roleId: "role_conformance",
    status: "active",
  });
  const { adapters, anchors } = makeAdapters([
    {
      _id: "user_conformance",
      convexAuthUserId: componentId("users", "comp_user_1"),
      activeConvexAuthOrganizationId: orgId,
    },
  ]);
  anchors.push({
    _id: "anchor_conformance",
    convexAuthOrganizationId: orgId,
  });
  const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
    orgs: "enabled",
    component: handle,
    adapters,
  });
  const viewer = await glue.resolveViewer(
    makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    }),
  );
  return viewer.hasPermission(required);
}

async function expectAuthError(
  fn: () => Promise<unknown>,
  expected: { code: string; authzCode?: string },
): Promise<void> {
  try {
    await fn();
    assert.fail("expected throwAuthError");
  } catch (err) {
    const data = typeof err === "object" && err !== null ? Reflect.get(err, "data") : undefined;
    if (!isAuthErrorPayload(data)) {
      assert.fail(`not an AuthErrorPayload: ${JSON.stringify(data)}`);
    }
    assert.equal(data.code, expected.code);
    if (expected.authzCode !== undefined) {
      assert.equal(data.authzCode, expected.authzCode);
    }
  }
}

// ---------------------------------------------------------------------------
// Consumer mode (orgs: disabled)
// ---------------------------------------------------------------------------

describe("createConvexAuthGlue — consumer mode (orgs: disabled)", () => {
  it("resolveViewer throws UNAUTHORIZED on anonymous", async () => {
    const { handle, state } = makeComponent();
    const ctx = makeCtx({ identity: null, component: state });
    const glue = createConvexAuthGlue<FakeUser>({
      orgs: "disabled",
      component: handle,
      adapters: { findUserByConvexAuthUserId: async () => null },
    });
    await expectAuthError(() => glue.resolveViewer(ctx), {
      code: "UNAUTHORIZED",
      authzCode: "AUTHENTICATION_REQUIRED",
    });
  });

  it("resolveViewer throws USER_MISSING if no local user row", async () => {
    const { handle, state } = makeComponent();
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser>({
      orgs: "disabled",
      component: handle,
      adapters: { findUserByConvexAuthUserId: async () => null },
    });
    await expectAuthError(() => glue.resolveViewer(ctx), {
      code: "UNAUTHORIZED",
      authzCode: "USER_MISSING",
    });
  });

  it("resolveViewer returns a mode='consumer' viewer with user attached", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const user: FakeUser = {
      _id: "u_db_1",
      convexAuthUserId: componentId("users", "comp_user_1"),
    };
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser>({
      orgs: "disabled",
      component: handle,
      adapters: { findUserByConvexAuthUserId: async () => user },
    });
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(viewer.mode, "consumer");
    assert.equal(viewer.user._id, "u_db_1");
    assert.equal(viewer.convexAuthUserId, "comp_user_1");
    // hasPermission is always true in consumer mode (no permission model).
    assert.equal(viewer.hasPermission("anything"), true);
  });
});

// ---------------------------------------------------------------------------
// B2B mode (orgs: enabled)
// ---------------------------------------------------------------------------

describe("createConvexAuthGlue — b2b mode (orgs: enabled)", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(`permission conformance: ${testCase.name}`, async () => {
      assert.equal(
        await checkB2BViewerPermission(testCase.granted, testCase.required),
        testCase.expected,
      );
    });
  }

  it("resolveViewer returns a b2b viewer when active membership exists", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const orgId = componentId("organizations", "org_alpha");
    state.orgs.set(orgId, { _id: orgId, name: "Alpha" });
    const roleId = "role_alpha_owner";
    state.roles.set(roleId, {
      _id: roleId,
      organizationId: orgId,
      key: "owner",
      permissions: ["users:roles", "billing:read"],
    });
    state.members.push({
      _id: "member_1",
      organizationId: orgId,
      userId: "comp_user_1",
      roleId,
      status: "active",
    });
    const { adapters, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        activeConvexAuthOrganizationId: orgId,
      },
    ]);
    anchors.push({ _id: "a_1", convexAuthOrganizationId: orgId });
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
    });
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(viewer.mode, "b2b");
    assert.equal(viewer.convexAuthOrganizationId, orgId);
    assert.equal(viewer.membership.roleKey, "owner");
    assert.deepEqual(viewer.membership.permissions, ["users:roles", "billing:read"]);
    assert.equal(viewer.hasPermission("users:roles"), true);
    assert.equal(viewer.hasPermission("nope"), false);
    assert.equal(viewer.requireOrganization(), orgId);
    viewer.requireRole("owner", "admin"); // does not throw
  });

  it("requirePermission throws FORBIDDEN with PERMISSION_REQUIRED", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const orgId = componentId("organizations", "org_alpha");
    state.roles.set("r1", {
      _id: "r1",
      organizationId: orgId,
      key: "viewer",
      permissions: ["dashboard:view"],
    });
    state.members.push({
      _id: "m1",
      organizationId: orgId,
      userId: "comp_user_1",
      roleId: "r1",
      status: "active",
    });
    const { adapters, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        activeConvexAuthOrganizationId: orgId,
      },
    ]);
    anchors.push({ _id: "a_1", convexAuthOrganizationId: orgId });
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
    });
    const viewer = await glue.resolveViewer(ctx);
    await expectAuthError(async () => viewer.requirePermission("users:roles"), {
      code: "FORBIDDEN",
      authzCode: "PERMISSION_REQUIRED",
    });
  });

  it("self-heals stale active-org hint by switching to first active membership", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const goodOrg = componentId("organizations", "org_real");
    state.roles.set("r_owner", {
      _id: "r_owner",
      organizationId: goodOrg,
      key: "owner",
      permissions: ["org:manage"],
    });
    state.members.push({
      _id: "m_real",
      organizationId: goodOrg,
      userId: "comp_user_1",
      roleId: "r_owner",
      status: "active",
    });
    // User row points at a stale org id that has no membership.
    const { adapters, users, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        activeConvexAuthOrganizationId: componentId("organizations", "org_stale"),
      },
    ]);
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
      invitedUsersGetPersonalOrg: false,
    });
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(viewer.convexAuthOrganizationId, goodOrg);
    // setActiveOrganization was called — user row now points at the right org.
    assert.equal(users[0]?.activeConvexAuthOrganizationId, goodOrg);
    // Anchor was created on-the-fly.
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0]?.convexAuthOrganizationId, goodOrg);
  });

  it("invitedUsersGetPersonalOrg=false: throws MEMBERSHIP_MISSING if no memberships", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const { adapters } = makeAdapters([
      { _id: "u_db_1", convexAuthUserId: componentId("users", "comp_user_1") },
    ]);
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
      invitedUsersGetPersonalOrg: false,
    });
    await expectAuthError(() => glue.resolveViewer(ctx), {
      code: "FORBIDDEN",
      authzCode: "MEMBERSHIP_MISSING",
    });
  });

  it("invitedUsersGetPersonalOrg=true: creates personal org on first resolution", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const { adapters, users, anchors } = makeAdapters([
      { _id: "u_db_1", convexAuthUserId: componentId("users", "comp_user_1") },
    ]);
    const ctx = makeCtx({
      identity: {
        subject: "u_1",
        issuer: "https://issuer.test",
        email: "u@x.test",
      },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
      invitedUsersGetPersonalOrg: true,
    });
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(viewer.membership.roleKey, "owner");
    assert.ok(viewer.convexAuthOrganizationId.startsWith("org_"));
    assert.equal(users[0]?.activeConvexAuthOrganizationId, viewer.convexAuthOrganizationId);
    assert.equal(anchors.length, 1);
    // Component now has exactly one org + one member.
    assert.equal(state.orgs.size, 1);
    assert.equal(state.members.length, 1);
  });

  it("self-heal swallows setActiveOrganization errors so QueryCtx reads don't blow up", async () => {
    // Repro of the production regression a consumer caught: glue's
    // self-heal path called setActiveOrganization in a QueryCtx, where
    // db.patch isn't available — the adapter threw, propagating up
    // through resolveViewer. The package-level swallow lets the request
    // succeed using the bootstrapped membership; the hint is persisted on
    // the next mutation that triggers self-heal.
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const goodOrg = componentId("organizations", "org_real");
    state.roles.set("r_owner", {
      _id: "r_owner",
      organizationId: goodOrg,
      key: "owner",
      permissions: ["org:manage"],
    });
    state.members.push({
      _id: "m_real",
      organizationId: goodOrg,
      userId: "comp_user_1",
      roleId: "r_owner",
      status: "active",
    });
    const { adapters, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        // No active org hint set; self-heal will fire on resolveViewer.
      },
    ]);
    anchors.push({ _id: "a_1", convexAuthOrganizationId: goodOrg });
    // Override setActiveOrganization to simulate the QueryCtx db.patch
    // missing — the adapter throws to mirror what production saw.
    adapters.setActiveOrganization = async () => {
      throw new TypeError("db.patch is not a function");
    };
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
      invitedUsersGetPersonalOrg: false,
    });
    // The throw inside setActiveOrganization must NOT bubble — viewer
    // resolution succeeds using the bootstrapped membership.
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(viewer.convexAuthOrganizationId, goodOrg);
    assert.equal(viewer.membership.roleKey, "owner");
  });

  it("expandPermissions: wildcard '*' role expands to the full domain catalog", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const orgId = componentId("organizations", "org_wild");
    state.roles.set("r_owner", {
      _id: "r_owner",
      organizationId: orgId,
      key: "owner",
      permissions: ["*"], // wildcard from the component
    });
    state.members.push({
      _id: "m_owner",
      organizationId: orgId,
      userId: "comp_user_1",
      roleId: "r_owner",
      status: "active",
    });
    const { adapters, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        activeConvexAuthOrganizationId: orgId,
      },
    ]);
    anchors.push({ _id: "a_1", convexAuthOrganizationId: orgId });
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    // expandPermissions adapter turns the wildcard into the consumer
    // catalog — the package never reads "*" semantically; the consumer
    // owns expansion.
    const CATALOG = ["org:read", "org:write", "billing:read", "billing:write"];
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters: {
        ...adapters,
        expandPermissions: (roleKey) => (roleKey === "owner" ? CATALOG : []),
      },
    });
    const viewer = await glue.resolveViewer(ctx);
    for (const p of CATALOG) assert.equal(viewer.hasPermission(p), true);
    // A perm NOT in the catalog stays denied.
    assert.equal(viewer.hasPermission("danger:nuke"), false);
  });

  it("resolvePermissionOverride: {add, remove} merges with role-derived base", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const orgId = componentId("organizations", "org_override");
    state.roles.set("r_member", {
      _id: "r_member",
      organizationId: orgId,
      key: "member",
      permissions: ["org:read", "billing:read"],
    });
    state.members.push({
      _id: "m_member",
      organizationId: orgId,
      userId: "comp_user_1",
      roleId: "r_member",
      status: "active",
    });
    const { adapters, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        activeConvexAuthOrganizationId: orgId,
      },
    ]);
    anchors.push({ _id: "a_1", convexAuthOrganizationId: orgId });
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    // Override: drop billing:read, add org:write. Merged result must
    // reflect both halves of the contract.
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters: {
        ...adapters,
        resolvePermissionOverride: async () => ({
          add: ["org:write"],
          remove: ["billing:read"],
        }),
      },
    });
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(viewer.hasPermission("org:read"), true); // base kept
    assert.equal(viewer.hasPermission("org:write"), true); // added
    assert.equal(viewer.hasPermission("billing:read"), false); // removed
  });

  it("resolvePermissionOverride returning null: viewer uses unaltered role permissions", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const orgId = componentId("organizations", "org_nooverride");
    state.roles.set("r1", {
      _id: "r1",
      organizationId: orgId,
      key: "viewer",
      permissions: ["dashboard:view"],
    });
    state.members.push({
      _id: "m1",
      organizationId: orgId,
      userId: "comp_user_1",
      roleId: "r1",
      status: "active",
    });
    const { adapters, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        activeConvexAuthOrganizationId: orgId,
      },
    ]);
    anchors.push({ _id: "a_1", convexAuthOrganizationId: orgId });
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    let calls = 0;
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters: {
        ...adapters,
        resolvePermissionOverride: async () => {
          calls++;
          return null;
        },
      },
    });
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(calls, 1); // adapter is invoked
    assert.equal(viewer.hasPermission("dashboard:view"), true);
    assert.equal(viewer.hasPermission("anything_else"), false);
  });

  it("expandPermissions + resolvePermissionOverride compose: expansion happens BEFORE override merge", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const orgId = componentId("organizations", "org_compose");
    state.roles.set("r_owner", {
      _id: "r_owner",
      organizationId: orgId,
      key: "owner",
      permissions: ["*"],
    });
    state.members.push({
      _id: "m_owner",
      organizationId: orgId,
      userId: "comp_user_1",
      roleId: "r_owner",
      status: "active",
    });
    const { adapters, anchors } = makeAdapters([
      {
        _id: "u_db_1",
        convexAuthUserId: componentId("users", "comp_user_1"),
        activeConvexAuthOrganizationId: orgId,
      },
    ]);
    anchors.push({ _id: "a_1", convexAuthOrganizationId: orgId });
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters: {
        ...adapters,
        // Owner wildcard expands to a 4-perm catalog.
        expandPermissions: (k) => (k === "owner" ? ["a", "b", "c", "d"] : []),
        // Override removes one expanded perm + adds an extra.
        resolvePermissionOverride: async (_ctx, args) => {
          // basePermissions param MUST already be the expanded catalog —
          // assert that the contract holds.
          assert.deepEqual([...args.basePermissions].toSorted(), ["a", "b", "c", "d"]);
          return { add: ["e"], remove: ["b"] };
        },
      },
    });
    const viewer = await glue.resolveViewer(ctx);
    assert.equal(viewer.hasPermission("a"), true);
    assert.equal(viewer.hasPermission("b"), false); // removed
    assert.equal(viewer.hasPermission("c"), true);
    assert.equal(viewer.hasPermission("d"), true);
    assert.equal(viewer.hasPermission("e"), true); // added
  });

  it("ensureAnchor from QueryCtx throws canonical ANCHOR_MISSING, not a raw TypeError", async () => {
    // Reproduce the cold-start case: first request after sign-in is a
    // query (reactive list, dashboard) — selfHeal needs to create the
    // anchor but ctx has no db.insert. Without the guard the consumer's
    // insertAnchor adapter would throw a raw TypeError, escaping the
    // canonical error contract. The guard catches this and surfaces
    // ANCHOR_MISSING instead.
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const orgId = componentId("organizations", "org_real");
    state.roles.set("r_owner", {
      _id: "r_owner",
      organizationId: orgId,
      key: "owner",
      permissions: ["org:manage"],
    });
    state.members.push({
      _id: "m_owner",
      organizationId: orgId,
      userId: "comp_user_1",
      roleId: "r_owner",
      status: "active",
    });
    const { adapters } = makeAdapters([
      { _id: "u_db_1", convexAuthUserId: componentId("users", "comp_user_1") },
    ]);
    // Critical: anchors stay empty AND insertAnchor would normally write.
    // We strip `ctx.db.insert` to simulate a QueryCtx so the guard fires.
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    (ctx as { db?: unknown }).db = {}; // QueryCtx has no insert
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
      invitedUsersGetPersonalOrg: false,
    });
    await expectAuthError(async () => glue.resolveViewer(ctx), {
      code: "NOT_FOUND",
      authzCode: "ANCHOR_MISSING",
    });
  });

  it("bootstrapNewUser is idempotent — second call does not create a duplicate org", async () => {
    const { handle, state } = makeComponent();
    state.identities.set("u_1", { userId: "comp_user_1", subject: "u_1" });
    const { adapters } = makeAdapters([
      { _id: "u_db_1", convexAuthUserId: componentId("users", "comp_user_1") },
    ]);
    const ctx = makeCtx({
      identity: { subject: "u_1", issuer: "https://issuer.test" },
      component: state,
    });
    const glue = createConvexAuthGlue<FakeUser, FakeAnchor>({
      orgs: "enabled",
      component: handle,
      adapters,
      invitedUsersGetPersonalOrg: true,
    });
    await glue.bootstrapNewUser(ctx, {
      convexAuthUserId: componentId("users", "comp_user_1"),
      email: "u@x.test",
    });
    await glue.bootstrapNewUser(ctx, {
      convexAuthUserId: componentId("users", "comp_user_1"),
      email: "u@x.test",
    });
    // Still exactly one org and one member.
    assert.equal(state.orgs.size, 1);
    assert.equal(state.members.length, 1);
  });
});
