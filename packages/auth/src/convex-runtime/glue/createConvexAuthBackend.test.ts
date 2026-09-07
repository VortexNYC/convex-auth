import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { createConvexAuthBackendAdapters } from "./createConvexAuthBackend";
import type { GlueAnchorMinimum, GlueCtx, GlueUserMinimum } from "./types";

type Row = Record<string, unknown>;

type FakeDbCall = { table: string; index?: string; eq?: [string, unknown] };

function isUserRow(row: unknown): row is GlueUserMinimum {
  return typeof row === "object" && row !== null && "_id" in row;
}

function isAnchorRow(row: unknown): row is GlueAnchorMinimum {
  return (
    typeof row === "object" && row !== null && "_id" in row && "convexAuthOrganizationId" in row
  );
}

/**
 * Minimal fake of the Convex db surface the generated adapters touch, plus a
 * call log so tests can assert WHICH index was hit with WHICH key.
 */
function makeDb(rows: Record<string, Row[]>) {
  const calls: FakeDbCall[] = [];
  const inserted: Array<{ table: string; value: Row }> = [];
  const patched: Array<{ table: string; id: unknown; value: Row }> = [];
  let nextId = 1;

  const db = {
    query(table: string) {
      const call: FakeDbCall = { table };
      calls.push(call);
      return {
        withIndex(
          index: string,
          range: (q: { eq: (field: string, value: unknown) => { eq: unknown } }) => unknown,
        ) {
          call.index = index;
          range({
            eq(field: string, value: unknown) {
              call.eq = [field, value];
              return this;
            },
          });
          return {
            async unique() {
              const [field, value] = call.eq ?? ["", undefined];
              return (rows[table] ?? []).find((r) => r[field] === value) ?? null;
            },
          };
        },
      };
    },
    async insert(table: string, value: Row) {
      const id = `${table}_${nextId++}`;
      inserted.push({ table, value });
      (rows[table] ??= []).push({ _id: id, ...value });
      return id;
    },
    async get(table: string, id: unknown) {
      return (rows[table] ?? []).find((r) => r._id === id) ?? null;
    },
    async patch(table: string, id: unknown, value: Row) {
      patched.push({ table, id, value });
    },
    normalizeId(_table: string, id: string) {
      return id;
    },
  };

  return { db, calls, inserted, patched };
}

const runQuery: GlueCtx["runQuery"] = async (): Promise<unknown> => null;

function ctxWith(db: unknown, identityCalls: { count: number }): GlueCtx {
  return {
    auth: {
      async getUserIdentity() {
        identityCalls.count += 1;
        return { subject: "sub_1", issuer: "https://example.test" };
      },
    },
    runQuery,
    db,
  };
}

const baseConfig = {
  buildOrganization: (args: { convexAuthOrganizationId: string; name: string }) => ({
    name: args.name,
    slug: args.name.toLowerCase(),
    convexAuthOrganizationId: args.convexAuthOrganizationId,
    status: "active",
  }),
  isUser: isUserRow,
  isAnchor: isAnchorRow,
};

describe("createConvexAuthBackendAdapters", () => {
  it("resolves the user by a pure index lookup on the id the glue passed", async () => {
    const { db, calls } = makeDb({
      users: [{ _id: "u1", convexAuthUserId: "cu_1", email: "a@b.test" }],
    });
    const identity = { count: 0 };
    const adapters = createConvexAuthBackendAdapters(baseConfig);

    const user = await adapters.findUserByConvexAuthUserId(ctxWith(db, identity), "cu_1");

    assert.equal(user?._id, "u1");
    assert.deepEqual(calls, [
      {
        table: "users",
        index: "by_convex_auth_user",
        eq: ["convexAuthUserId", "cu_1"],
      },
    ]);
  });

  it("NEVER re-resolves identity inside the user adapter", async () => {
    // This is the contract violation shipped in some consumer projects and in
    // both convex-core canonical examples: they ignore the convexAuthUserId the
    // glue passes and re-run ctx.auth.getUserIdentity() plus a second
    // identity.getByIdentity round-trip. The adapter contract forbids it — the
    // glue already did that resolution. Generating the adapter makes it
    // unwritable, and this test is what keeps it that way.
    const { db } = makeDb({
      users: [{ _id: "u1", convexAuthUserId: "cu_1", email: "a@b.test" }],
    });
    const identity = { count: 0 };
    const adapters = createConvexAuthBackendAdapters(baseConfig);

    await adapters.findUserByConvexAuthUserId(ctxWith(db, identity), "cu_1");

    assert.equal(identity.count, 0, "adapter must not call ctx.auth.getUserIdentity");
  });

  it("returns null when no local row carries the component id", async () => {
    const { db } = makeDb({ users: [] });
    const adapters = createConvexAuthBackendAdapters(baseConfig);
    assert.equal(
      await adapters.findUserByConvexAuthUserId(ctxWith(db, { count: 0 }), "cu_missing"),
      null,
    );
  });

  it("resolves the anchor by the organization bridge index", async () => {
    const { db, calls } = makeDb({
      organizations: [{ _id: "o1", convexAuthOrganizationId: "co_1" }],
    });
    const adapters = createConvexAuthBackendAdapters(baseConfig);

    const anchor = await adapters.findAnchorByConvexAuthOrganizationId(
      ctxWith(db, { count: 0 }),
      "co_1",
    );

    assert.equal(anchor?._id, "o1");
    assert.deepEqual(calls[0], {
      table: "organizations",
      index: "by_convex_auth_organization",
      eq: ["convexAuthOrganizationId", "co_1"],
    });
  });

  it("honours custom table and index names", async () => {
    const { db, calls } = makeDb({
      app_users: [{ _id: "u1", convexAuthUserId: "cu_1" }],
    });
    const adapters = createConvexAuthBackendAdapters({
      ...baseConfig,
      storage: {
        usersTable: "app_users",
        usersByConvexAuthUserIdIndex: "by_component_user",
      },
    });

    await adapters.findUserByConvexAuthUserId(ctxWith(db, { count: 0 }), "cu_1");

    assert.equal(calls[0]?.table, "app_users");
    assert.equal(calls[0]?.index, "by_component_user");
  });

  it("inserts the anchor using the consumer's buildOrganization row", async () => {
    const { db, inserted } = makeDb({ organizations: [] });
    const adapters = createConvexAuthBackendAdapters(baseConfig);

    const anchor = await adapters.insertAnchor(ctxWith(db, { count: 0 }), {
      convexAuthOrganizationId: "co_9",
      name: "Acme",
      createdByConvexAuthUserId: "cu_1",
    });

    assert.equal(anchor.convexAuthOrganizationId, "co_9");
    assert.deepEqual(inserted[0]?.value, {
      name: "Acme",
      slug: "acme",
      convexAuthOrganizationId: "co_9",
      status: "active",
    });
  });

  it("rejects a buildOrganization that drops the bridge column", async () => {
    const { db } = makeDb({ organizations: [] });
    const adapters = createConvexAuthBackendAdapters({
      ...baseConfig,
      buildOrganization: (args: { name: string }) => ({ name: args.name }),
    });

    await assert.rejects(
      async () =>
        await adapters.insertAnchor(ctxWith(db, { count: 0 }), {
          convexAuthOrganizationId: "co_9",
          name: "Acme",
          createdByConvexAuthUserId: "cu_1",
        }),
      /must set convexAuthOrganizationId/,
    );
  });

  it("writes the active-org hint from a mutation context", async () => {
    const { db, patched } = makeDb({
      users: [{ _id: "u1", convexAuthUserId: "cu_1" }],
    });
    const adapters = createConvexAuthBackendAdapters(baseConfig);

    await adapters.setActiveOrganization(ctxWith(db, { count: 0 }), { _id: "u1" }, "co_1");

    assert.deepEqual(patched, [
      {
        table: "users",
        id: "u1",
        value: { activeConvexAuthOrganizationId: "co_1" },
      },
    ]);
  });

  it("silently skips the active-org hint in a read-only context", async () => {
    // The glue's self-heal path calls this during reads and swallows throws,
    // but skipping is cheaper and keeps the read path free of exceptions.
    const readOnlyDb = { query: () => ({}) };
    const adapters = createConvexAuthBackendAdapters(baseConfig);

    await adapters.setActiveOrganization(ctxWith(readOnlyDb, { count: 0 }), { _id: "u1" }, "co_1");
  });

  it("omits expandPermissions unless the consumer supplies one", () => {
    assert.equal("expandPermissions" in createConvexAuthBackendAdapters(baseConfig), false);
    assert.equal(
      "expandPermissions" in
        createConvexAuthBackendAdapters({
          ...baseConfig,
          expandPermissions: () => ["org:read"],
        }),
      true,
    );
  });
});
