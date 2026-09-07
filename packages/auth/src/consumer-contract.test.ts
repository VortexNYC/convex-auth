import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, it } from "vitest";

import { checkConsumerContract } from "./consumer-contract";

function makeFixture(): {
  dir: string;
  write: (rel: string, content: string) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "convex-auth-contract-"));
  const write = (rel: string, content: string): void => {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  };
  const cleanup = (): void => {
    rmSync(dir, { recursive: true, force: true });
  };
  return { dir, write, cleanup };
}

describe("checkConsumerContract", () => {
  let fixture: ReturnType<typeof makeFixture>;
  beforeEach(() => {
    fixture = makeFixture();
  });
  afterEach(() => {
    fixture.cleanup();
  });

  it("returns ok=true on a clean convex dir", () => {
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export default defineSchema({",
        "  organizations: defineTable({",
        "    convexAuthOrganizationId: v.string(),",
        "    plan: v.string(),",
        "  }),",
        "  contacts: defineTable({",
        '    organizationId: v.id("organizations"),',
        "  }),",
        "});",
        "",
      ].join("\n"),
    );
    fixture.write(
      "organizations.ts",
      [
        'import { mutation } from "./_generated/server";',
        "",
        "export const ensureConvexAuthOrganization = mutation({",
        "  args: {},",
        "  handler: async () => null,",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
  });

  it("flags local defineTable for forbidden mirror tables", () => {
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export default defineSchema({",
        "  organization_members: defineTable({",
        "    userId: v.string(),",
        "  }),",
        "  organization_roles: defineTable({}),",
        "  organization_invitations: defineTable({}),",
        "  api_keys: defineTable({}),",
        "  auth_md_registrations: defineTable({}),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, false);
    const rules = result.violations.map((v) => v.rule);
    assert.equal(
      result.violations.every((v) => v.rule === "local-org-member-truth-table"),
      true,
      `expected only local-org-member-truth-table, got: ${rules.join(",")}`,
    );
    const tables = result.violations.map((v) => v.message);
    for (const t of [
      "organization_members",
      "organization_roles",
      "organization_invitations",
      "api_keys",
      "auth_md_registrations",
    ]) {
      assert.equal(
        tables.some((m) => m.includes(t)),
        true,
        `expected violation for ${t}`,
      );
    }
  });

  it("flags split schema files that export forbidden mirror tables", () => {
    fixture.write(
      "schemas/organization_members.ts",
      [
        'import { defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export const organizationMembersTable = defineTable({",
        '  userId: v.id("users"),',
        '  organizationId: v.id("organizations"),',
        "});",
        "",
      ].join("\n"),
    );
    fixture.write(
      "schemas/organization_roles.ts",
      [
        'import { defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export const organizationRolesTable = defineTable({",
        '  organizationId: v.id("organizations"),',
        "  name: v.string(),",
        "});",
        "",
      ].join("\n"),
    );

    const result = checkConsumerContract({ convexDir: fixture.dir });

    assert.equal(result.ok, false);
    const splitSchemaHits = result.violations.filter(
      (v) => v.rule === "local-org-member-truth-table" && v.message.includes("split-schema"),
    );
    assert.equal(splitSchemaHits.length, 2, JSON.stringify(result.violations));
    assert.equal(
      splitSchemaHits.some((v) => v.file === "schemas/organization_members.ts"),
      true,
    );
    assert.equal(
      splitSchemaHits.some((v) => v.file === "schemas/organization_roles.ts"),
      true,
    );
  });

  it("flags ctx.db.insert / replace / patch into forbidden tables", () => {
    fixture.write(
      "writes.ts",
      [
        "export const a = async (ctx: unknown) => {",
        '  await ctx.db.insert("organization_members", { x: 1 });',
        '  await ctx.db.replace("organization_roles" as unknown, id, {});',
        '  await ctx.db.patch("api_keys", id, {});',
        '  await ctx.db.insert("organization_invitations", {});',
        "};",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, false);
    const rules = new Set(result.violations.map((v) => v.rule));
    assert.equal(rules.size, 1);
    assert.equal(rules.has("local-mirror-write"), true);
    assert.equal(result.violations.length, 4);
  });

  it("flags bidirectional mirror writer declarations", () => {
    fixture.write(
      "mirrors.ts",
      [
        "export async function ensureConvexAuthMember() {}",
        "export const ensureConvexAuthRole = async () => {};",
        "export const ensureConvexAuthRoleForTemplate = async () => {};",
        "export async function ensureConvexAuthInvitation() {}",
        "const ensureConvexAuthApiKey = async () => {};",
        "export { ensureConvexAuthApiKey };",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, false);
    const writers = new Set(
      result.violations
        .filter((v) => v.rule === "bidirectional-mirror-writer")
        .map((v) => {
          const m = v.message.match(/"([^"]+)"/);
          return m ? m[1] : "";
        }),
    );
    assert.equal(writers.has("ensureConvexAuthMember"), true);
    assert.equal(writers.has("ensureConvexAuthRole"), true);
    assert.equal(writers.has("ensureConvexAuthRoleForTemplate"), true);
    assert.equal(writers.has("ensureConvexAuthInvitation"), true);
    assert.equal(writers.has("ensureConvexAuthApiKey"), true);
  });

  it("does NOT flag ensureConvexAuthOrganization (anchor mapper is allowed)", () => {
    fixture.write(
      "organizations.ts",
      [
        "export async function ensureConvexAuthOrganization() {}",
        "export const ensureConvexAuthOrganization2 = async () => {};",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
  });

  it("does NOT flag GenericId / v.id type usages of component table names", () => {
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        'import type { GenericId } from "convex/values";',
        "",
        'type MemberId = GenericId<"organization_members">;',
        'type RoleId = GenericId<"organization_roles">;',
        "",
        "export default defineSchema({",
        "  organizations: defineTable({",
        "    primaryMemberId: v.string(),",
        "  }),",
        "  audit: defineTable({",
        '    memberRef: v.id("organization_members"),',
        '    roleRef: v.id("organization_roles"),',
        '    inviteRef: v.id("organization_invitations"),',
        '    apiKeyRef: v.id("api_keys"),',
        "  }),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  });

  it("excludes _generated and *.test.ts files", () => {
    // These would otherwise be violations.
    fixture.write(
      "_generated/server.ts",
      'export const x = async (ctx: unknown) => { await ctx.db.insert("organization_members", {}); };\n',
    );
    fixture.write(
      "things.test.ts",
      [
        "export async function ensureConvexAuthMember() {}",
        'const _t = (ctx: unknown) => ctx.db.insert("api_keys", {});',
        "",
      ].join("\n"),
    );
    fixture.write("nested/_generated/api.ts", "export async function ensureConvexAuthRole() {}\n");
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  });

  it("flags consumer-style camelCase mirror with convexOrgId + convexAuthUserId (name-agnostic)", () => {
    // A consumer's actual schema (renamed table, shorthand bridge column) used
    // to slip past the snake_case-name rule. The bridge-column rule must
    // catch it on structure alone.
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export default defineSchema({",
        "  organizations: defineTable({",
        "    convexAuthOrganizationId: v.string(),",
        "    plan: v.string(),",
        "  }),",
        "  organizationMembers: defineTable({",
        "    convexOrgId: v.string(),",
        "    convexAuthUserId: v.string(),",
        "    role: v.string(),",
        "    joinedAt: v.number(),",
        "  })",
        '    .index("by_org", ["convexOrgId"])',
        '    .index("by_user", ["convexAuthUserId"]),',
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, false, JSON.stringify(result.violations));
    const bridge = result.violations.filter((v) => v.rule === "local-bridge-mirror");
    assert.equal(bridge.length, 1, JSON.stringify(result.violations));
    const v = bridge[0];
    assert.ok(v);
    assert.equal(v.file, "schema.ts");
    assert.equal(v.message.includes("organizationMembers"), true);
    assert.equal(v.message.includes("convexOrgId"), true);
    assert.equal(v.message.includes("convexAuthUserId"), true);
    // Must NOT flag the legitimate organizations anchor as the violating table.
    assert.equal(
      result.violations.some(
        (x) =>
          x.rule === "local-bridge-mirror" &&
          x.message.startsWith('Local defineTable "organizations"'),
      ),
      false,
    );
  });

  it("does NOT flag users anchor with convexAuthUserId (legacy mirror)", () => {
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export default defineSchema({",
        "  users: defineTable({",
        "    convexAuthUserId: v.string(),",
        "    email: v.string(),",
        "  }),",
        "  organizations: defineTable({",
        "    convexAuthOrganizationId: v.string(),",
        "  }),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  });

  it("honors legitAnchorTables override (e.g. tenants instead of organizations)", () => {
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export default defineSchema({",
        "  tenants: defineTable({",
        "    convexAuthOrganizationId: v.string(),",
        "  }),",
        "});",
        "",
      ].join("\n"),
    );
    // Default config: tenants is NOT a recognized anchor → flagged.
    const defaultResult = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(defaultResult.ok, false);
    assert.equal(
      defaultResult.violations.some((v) => v.rule === "local-bridge-mirror"),
      true,
    );
    // Override: tenants IS an anchor → clean.
    const overridden = checkConsumerContract({
      convexDir: fixture.dir,
      legitAnchorTables: ["tenants", "users"],
    });
    assert.equal(overridden.ok, true, JSON.stringify(overridden.violations));
  });

  it("ignores bridge-shaped columns inside v.object nested validators (no false positive on non-table prop)", () => {
    // A non-defineTable v.object that happens to mention a bridge name in
    // a comment-like context shouldn't trip the rule. We rely on defineTable
    // anchoring, so this should be clean.
    fixture.write(
      "ignore-me.ts",
      [
        'import { v } from "convex/values";',
        "// This is just a validator constant, not a defineTable.",
        "export const PointerShape = v.object({",
        "  convexAuthUserId: v.string(),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  });

  it("ignores forbidden patterns inside line comments", () => {
    fixture.write(
      "writes.ts",
      [
        "export const a = async (ctx: unknown) => {",
        "  // Historical note: previous code used to do",
        '  // ctx.db.insert("organization_members", ...) here.',
        "  return null;",
        "};",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  });

  it("ignores forbidden patterns inside block comments and JSDoc", () => {
    fixture.write(
      "writes.ts",
      [
        "/**",
        " * After Phase 2b, tests that previously did",
        ' * `ctx.db.insert("organization_members", ...)` must seed via component.',
        " * The legacy `ensureConvexAuthMember` writer was deleted in that PR.",
        " */",
        "export const helper = async () => null;",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  });

  it("still flags real code even when comments mention the pattern", () => {
    fixture.write(
      "writes.ts",
      [
        '// Documentation: ctx.db.insert("organization_members", ...) is forbidden.',
        "export const bad = async (ctx: unknown) => {",
        '  await ctx.db.insert("organization_members", { x: 1 });',
        "};",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    const writeHits = result.violations.filter((v) => v.rule === "local-mirror-write");
    assert.equal(writeHits.length, 1, JSON.stringify(result.violations));
    assert.equal(
      writeHits[0]?.line,
      3,
      "violation must point at the real code line, not the comment",
    );
  });

  it("legitAnchorTables override allows a deliberate per-member override table", () => {
    // A consumer has `member_settings` keyed by convexAuthMemberId for per-member
    // permission overrides — that's a legitimate one-way cache, not a mirror.
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        'import { v } from "convex/values";',
        "",
        "export default defineSchema({",
        "  organizations: defineTable({",
        "    convexAuthOrganizationId: v.string(),",
        "  }),",
        "  member_settings: defineTable({",
        "    convexAuthMemberId: v.string(),",
        "    permissions: v.optional(v.array(v.string())),",
        '  }).index("by_convex_auth_member", ["convexAuthMemberId"]),',
        "});",
        "",
      ].join("\n"),
    );
    // Default config: flagged.
    const defaultResult = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(defaultResult.ok, false);
    // With explicit allow-list: clean.
    const overridden = checkConsumerContract({
      convexDir: fixture.dir,
      legitAnchorTables: ["organizations", "users", "member_settings"],
    });
    assert.equal(overridden.ok, true, JSON.stringify(overridden.violations));
  });

  it("flags a system-only reader inside a client-callable function", () => {
    fixture.write(
      "leak.ts",
      [
        'import { query } from "./_generated/server";',
        'import { components } from "./_generated/api";',
        "export const peek = query({",
        "  args: {},",
        "  handler: async (ctx) =>",
        "    ctx.runQuery(components.convexAuth.organizations.getInvitationByIdForSystem, {}),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    const v = result.violations.find((x) => x.rule === "tenant-facing-system-reader");
    assert.ok(v, "expected a tenant-facing-system-reader violation");
    assert.equal(v.file, "leak.ts");
    assert.equal(v.message.includes("getInvitationByIdForSystem"), true);
  });

  it("keeps Agent Auth authority and replay storage inside the component", () => {
    fixture.write(
      "schema.ts",
      [
        'import { defineSchema, defineTable } from "convex/server";',
        "export default defineSchema({",
        "  agent_replay_records: defineTable({}),",
        "  agent_host_replay_records: defineTable({}),",
        "  agent_device_authorizations: defineTable({}),",
        "  agent_device_authorization_attempts: defineTable({}),",
        "});",
        "",
      ].join("\n"),
    );
    fixture.write(
      "agent.ts",
      [
        'import { mutation } from "./_generated/server";',
        "export const consume = mutation({",
        "  args: {},",
        "  handler: async (ctx) =>",
        "    ctx.runMutation(components.convexAuth.agentAuth.decideAgentDeviceAuthorization, {}),",
        "});",
        "",
      ].join("\n"),
    );

    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(
      result.violations.some((violation) => violation.rule === "local-org-member-truth-table"),
      true,
      JSON.stringify(result.violations),
    );
    assert.equal(
      result.violations.some((violation) => violation.rule === "tenant-facing-system-reader"),
      true,
      JSON.stringify(result.violations),
    );
  });

  it("flags the curried permission wrappers too", () => {
    fixture.write(
      "leak2.ts",
      [
        'export const peek = permissionMutation("users:roles")({',
        "  args: {},",
        "  handler: async (ctx) =>",
        "    ctx.runQuery(components.convexAuth.servicePrincipals.getServicePrincipal, {}),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.ok(
      result.violations.some((x) => x.rule === "tenant-facing-system-reader"),
      "expected a violation for the curried permissionMutation",
    );
  });

  it("allows system-only readers inside internal* functions", () => {
    fixture.write(
      "ok.ts",
      [
        'import { internalQuery } from "./_generated/server";',
        "export const resolve = internalQuery({",
        "  args: {},",
        "  handler: async (ctx) =>",
        "    ctx.runQuery(components.convexAuth.organizations.getMemberByIdForSystem, {}),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(
      result.violations.some((x) => x.rule === "tenant-facing-system-reader"),
      false,
      JSON.stringify(result.violations),
    );
  });

  it("allows the org-scoped readers inside a client-callable function", () => {
    fixture.write(
      "scoped.ts",
      [
        "export const role = query({",
        "  args: {},",
        "  handler: async (ctx) =>",
        "    ctx.runQuery(components.convexAuth.organizations.getRole, {",
        "      roleId, organizationId: ctx.viewer.anchor._id,",
        "    }),",
        "});",
        "",
      ].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(
      result.violations.some((x) => x.rule === "tenant-facing-system-reader"),
      false,
      JSON.stringify(result.violations),
    );
  });

  it("reports rule, file, and line number for each violation", () => {
    fixture.write(
      "bad.ts",
      ["// line 1", "export const ensureConvexAuthMember = async () => {};", ""].join("\n"),
    );
    const result = checkConsumerContract({ convexDir: fixture.dir });
    assert.equal(result.violations.length, 1);
    const v = result.violations[0];
    assert.ok(v);
    assert.equal(v.rule, "bidirectional-mirror-writer");
    assert.equal(v.file, "bad.ts");
    assert.equal(v.line, 2);
    assert.equal(v.message.includes("consumer-contract.md"), true);
  });
});
