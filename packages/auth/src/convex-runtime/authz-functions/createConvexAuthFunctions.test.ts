import assert from "node:assert/strict";

import { hasPermission } from "../../compat/permissions";
import { mutationGeneric, queryGeneric } from "convex/server";
import { describe, it } from "vitest";

import type { Id } from "../../component/_generated/dataModel";
import { isAuthErrorPayload } from "../glue/throwAuthError";
import type { B2BGlue, B2BViewer, GlueCtx, ResolvedMembership } from "../glue/types";
import { createConvexAuthFunctions } from "./createConvexAuthFunctions";

/**
 * Fakes. The factory is a thin wrapper over convex-helpers customMutation /
 * customQuery + the glue's viewer. We don't need a Convex deployment to prove
 * its security contract — we need to prove the gate runs BEFORE the handler and
 * that a viewer lacking the permission can never reach the handler body.
 * Fake builder: `(spec) => spec`. convex-helpers' customFnBuilder calls
 * `builder({ args, returns, handler: composedHandler })`, so the returned spec's
 * `handler` IS the composed `gate -> userHandler` pipeline. Invoking it runs the
 * real authorization path.
 */

type LocalUser = { _id: string; convexAuthUserId?: Id<"users"> };
type LocalAnchor = {
  _id: string;
  convexAuthOrganizationId: Id<"organizations">;
};

const COMPONENT_USER_ID = componentId("users", "vau_1");
const COMPONENT_ORGANIZATION_ID = componentId("organizations", "vao_1");
const COMPONENT_MEMBER_ID = componentId("organization_members", "mem_1");

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

const fakeQuery = queryGeneric;
const fakeMutation = mutationGeneric;

/*
 * The factory's builders are typed to return RegisteredMutation/Query (no
 * `.handler` on the public type). Our fake builder returns the raw composed
 * spec at runtime, so we reach into it to execute the gate -> handler pipeline.
 */
const exec = (registered: unknown) => {
  if ((typeof registered !== "object" && typeof registered !== "function") || registered === null) {
    throw new TypeError("expected an executable spec");
  }
  const handler = Reflect.get(registered, "_handler");
  if (typeof handler !== "function") {
    throw new TypeError("expected an executable handler");
  }
  return {
    handler: async (ctx: GlueCtx, args: Record<string, unknown>) =>
      await Reflect.apply(handler, registered, [ctx, args]),
  };
};

function readAuthzCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const data = Reflect.get(error, "data");
  return typeof data === "object" && data !== null ? Reflect.get(data, "authzCode") : undefined;
}

const membership: ResolvedMembership = {
  convexAuthMemberId: COMPONENT_MEMBER_ID,
  roleKey: "member",
  status: "active",
  permissions: ["widgets:view"] /* NOTE: deliberately lacks "widgets:edit" */,
};

function buildViewer(
  permissions: string[],
  roleKey: string = membership.roleKey,
): B2BViewer<LocalUser, LocalAnchor> {
  const has = (p: string) => hasPermission(permissions, p);
  return {
    mode: "b2b",
    identity: { subject: "user_1", issuer: "test" },
    user: { _id: "u1", convexAuthUserId: COMPONENT_USER_ID },
    convexAuthUserId: COMPONENT_USER_ID,
    anchor: {
      _id: "org_local_1",
      convexAuthOrganizationId: COMPONENT_ORGANIZATION_ID,
    },
    convexAuthOrganizationId: COMPONENT_ORGANIZATION_ID,
    membership: { ...membership, permissions, roleKey },
    hasPermission: has,
    /**
     * Mirrors the real glue: throws a typed auth error when the permission is
     * absent. This is the ONLY enforcement point the factory relies on.
     */
    requirePermission: (p: string) => {
      if (!has(p)) {
        const err = new Error(`Permission required: ${p}`) as Error & {
          data?: unknown;
        };
        /*
         * Shape the payload like throwAuthError's ConvexError data so the test
         * can assert it's a genuine authz denial, not an incidental throw.
         */
        err.data = {
          code: "FORBIDDEN",
          authzCode: "PERMISSION_REQUIRED",
          message: `Permission required: ${p}`,
        };
        throw err;
      }
    },
    requireOrganization: () => COMPONENT_ORGANIZATION_ID,
    /**
     * Mirrors the real glue: throws PERMISSION_REQUIRED when the viewer's role
     * is not among the allowed keys.
     */
    requireRole: (...allowedRoleKeys: string[]) => {
      if (!allowedRoleKeys.includes(roleKey)) {
        const err = new Error(`Role required: one of [${allowedRoleKeys.join(", ")}]`) as Error & {
          data?: unknown;
        };
        err.data = {
          code: "FORBIDDEN",
          authzCode: "PERMISSION_REQUIRED",
          message: `Role required: one of [${allowedRoleKeys.join(", ")}]`,
        };
        throw err;
      }
    },
  };
}

function buildGlue(viewer: B2BViewer<LocalUser, LocalAnchor>): B2BGlue<LocalUser, LocalAnchor> {
  return {
    mode: "b2b",
    resolveViewer: async (_ctx: GlueCtx) => viewer,
    bootstrapNewUser: async () => {},
  };
}

const fakeCtx: GlueCtx = {
  auth: {
    getUserIdentity: async () => ({ subject: "user_1", issuer: "test" }),
  },
  runQuery: async () => null,
  runMutation: async () => null,
};

function makeFunctions(
  permissions: string[],
  onAuthorizationDenied?: (
    ctx: GlueCtx,
    args: {
      permission?: string;
      error: unknown;
      viewer?: B2BViewer<LocalUser, LocalAnchor>;
    },
  ) => Promise<void> | void,
) {
  return createConvexAuthFunctions({
    glue: buildGlue(buildViewer(permissions)),
    query: fakeQuery,
    mutation: fakeMutation,
    onAuthorizationDenied,
  });
}

function makeFunctionsForRole(roleKey: string) {
  return createConvexAuthFunctions({
    glue: buildGlue(buildViewer(["widgets:view"], roleKey)),
    query: fakeQuery,
    mutation: fakeMutation,
  });
}

describe("createConvexAuthFunctions — security contract", () => {
  it("permissionMutation runs the handler when the viewer HAS the permission", async () => {
    let handlerRan = false;
    const { permissionMutation } = makeFunctions(["widgets:view", "widgets:edit"]);
    const spec = exec(
      permissionMutation("widgets:edit")({
        args: {},
        handler: async (ctx) => {
          handlerRan = true;
          return ctx.viewer.convexAuthOrganizationId;
        },
      }),
    );

    const result = await spec.handler(fakeCtx, {});
    assert.equal(handlerRan, true);
    assert.equal(result, "vao_1");
  });

  it("permissionMutation BLOCKS before the handler when the permission is missing", async () => {
    let handlerRan = false;
    const { permissionMutation } = makeFunctions(["widgets:view"]); /* no edit */
    const spec = exec(
      permissionMutation("widgets:edit")({
        args: {},
        handler: async () => {
          handlerRan = true;
          return "should-never-return";
        },
      }),
    );

    await assert.rejects(
      () => spec.handler(fakeCtx, {}),
      (err: Error & { data?: unknown }) => {
        /* It's a genuine authz denial (PERMISSION_REQUIRED), not an incidental error. */
        assert.ok(isAuthErrorDenial(err.data), "expected a PERMISSION_REQUIRED denial");
        return true;
      },
    );
    /* The crux: the handler body NEVER executed. The check is unbypassable. */
    assert.equal(handlerRan, false, "handler must not run when permission is denied");
  });

  it("permissionQuery enforces the same gate", async () => {
    let handlerRan = false;
    const { permissionQuery } = makeFunctions(["widgets:view"]);
    const spec = exec(
      permissionQuery("widgets:edit")({
        args: {},
        handler: async () => {
          handlerRan = true;
          return true;
        },
      }),
    );
    await assert.rejects(() => spec.handler(fakeCtx, {}));
    assert.equal(handlerRan, false);
  });

  it("authedQuery injects the pre-resolved viewer", async () => {
    const { authedQuery } = makeFunctions(["widgets:view"]);
    const spec = exec(
      authedQuery({
        args: {},
        handler: async (ctx) => ctx.viewer.user._id,
      }),
    );
    assert.equal(await spec.handler(fakeCtx, {}), "u1");
  });

  /*
   * TEETH: prove the difference between the factory path and a hand-rolled raw
   * mutation is REAL. The same viewer (lacking "widgets:edit") sails straight
   * into an unguarded raw handler — exactly the drift bug class the factory
   * exists to close. If this ever stops being true (e.g. the factory's gate
   * silently no-ops), the contract test above would also pass trivially, so the
   * two together pin the behavior.
   */
  it("fires onAuthorizationDenied before re-throwing, with the granular authzCode + resolved viewer — and the handler still never runs", async () => {
    let handlerRan = false;
    const denials: Array<{
      permission?: string;
      authzCode?: unknown;
      attributedUserId?: unknown;
    }> = [];
    const { permissionMutation } = makeFunctions(
      ["widgets:view"],
      (_ctx, { permission, error, viewer }) => {
        denials.push({
          permission,
          authzCode: readAuthzCode(error),
          /**
           * A permission denial happens AFTER resolution → viewer present, so
           * the audit can attribute the denial to the authenticated principal.
           */
          attributedUserId: viewer?.convexAuthUserId,
        });
      },
    );
    const spec = exec(
      permissionMutation("widgets:edit")({
        args: {},
        handler: async () => {
          handlerRan = true;
          return "nope";
        },
      }),
    );

    await assert.rejects(() => spec.handler(fakeCtx, {}));
    /*
     * The hook saw the denial — so a consumer can emit its audit row — and the
     * original error still propagated (hook cannot swallow it).
     */
    assert.deepEqual(denials, [
      {
        permission: "widgets:edit",
        authzCode: "PERMISSION_REQUIRED",
        attributedUserId: "vau_1",
      },
    ]);
    assert.equal(handlerRan, false);
  });

  it("omits the viewer when RESOLUTION itself fails (no trustworthy principal to attribute)", async () => {
    const denials: Array<{ hasViewer: boolean; authzCode?: unknown }> = [];
    /* Glue whose resolveViewer throws an AUTHENTICATION_REQUIRED-style error. */
    const failingGlue: B2BGlue<LocalUser, LocalAnchor> = {
      mode: "b2b",
      resolveViewer: async () => {
        const err = new Error("unauthenticated") as Error & { data?: unknown };
        err.data = {
          code: "UNAUTHORIZED",
          authzCode: "AUTHENTICATION_REQUIRED",
        };
        throw err;
      },
      bootstrapNewUser: async () => {},
    };
    const { permissionMutation } = createConvexAuthFunctions({
      glue: failingGlue,
      query: fakeQuery,
      mutation: fakeMutation,
      onAuthorizationDenied: (_ctx, { error, viewer }) => {
        denials.push({
          hasViewer: viewer !== undefined,
          authzCode: readAuthzCode(error),
        });
      },
    });
    const spec = exec(
      permissionMutation("widgets:edit")({
        args: {},
        handler: async () => "x",
      }),
    );
    await assert.rejects(() => spec.handler(fakeCtx, {}));
    assert.deepEqual(denials, [{ hasViewer: false, authzCode: "AUTHENTICATION_REQUIRED" }]);
  });

  it("does NOT fire onAuthorizationDenied on the success path", async () => {
    const denials: unknown[] = [];
    const { permissionMutation } = makeFunctions(["widgets:view", "widgets:edit"], (_ctx, args) => {
      denials.push(args);
    });
    const spec = exec(
      permissionMutation("widgets:edit")({
        args: {},
        handler: async () => "ok",
      }),
    );
    assert.equal(await spec.handler(fakeCtx, {}), "ok");
    assert.deepEqual(denials, []);
  });

  /*
   * Increment 5b — any/all/role wrapper coverage. Same unbypassable gate, same
   * denial path; the handler never runs when the check fails.
   */

  it("permissionAnyMutation ALLOWS when the viewer holds at least one permission", async () => {
    let ran = false;
    const { permissionAnyMutation } = makeFunctions(["widgets:view"]);
    const spec = exec(
      permissionAnyMutation(["widgets:edit", "widgets:view"])({
        args: {},
        handler: async () => {
          ran = true;
          return "ok";
        },
      }),
    );
    assert.equal(await spec.handler(fakeCtx, {}), "ok");
    assert.equal(ran, true);
  });

  it("permissionAnyMutation BLOCKS when the viewer holds NONE of the permissions", async () => {
    let ran = false;
    const { permissionAnyMutation } = makeFunctions(["widgets:view"]);
    const spec = exec(
      permissionAnyMutation(["widgets:edit", "widgets:delete"])({
        args: {},
        handler: async () => {
          ran = true;
          return "nope";
        },
      }),
    );
    await assert.rejects(() => spec.handler(fakeCtx, {}));
    assert.equal(ran, false);
  });

  it("permissionAllMutation BLOCKS when the viewer is missing ANY of the permissions", async () => {
    let ran = false;
    const { permissionAllMutation } = makeFunctions(["widgets:view"]); /* lacks edit */
    const spec = exec(
      permissionAllMutation(["widgets:view", "widgets:edit"])({
        args: {},
        handler: async () => {
          ran = true;
          return "nope";
        },
      }),
    );
    await assert.rejects(() => spec.handler(fakeCtx, {}));
    assert.equal(ran, false);
  });

  it("permissionAllMutation ALLOWS when the viewer holds every permission", async () => {
    let ran = false;
    const { permissionAllMutation } = makeFunctions(["widgets:view", "widgets:edit"]);
    const spec = exec(
      permissionAllMutation(["widgets:view", "widgets:edit"])({
        args: {},
        handler: async () => {
          ran = true;
          return "ok";
        },
      }),
    );
    assert.equal(await spec.handler(fakeCtx, {}), "ok");
    assert.equal(ran, true);
  });

  it("roleMutation ALLOWS the matching role and BLOCKS others (viewer role = 'member')", async () => {
    const { roleMutation } = makeFunctions(["widgets:view"]);
    /* member is allowed */
    let ran = false;
    const ok = exec(
      roleMutation(
        "member",
        "owner",
      )({
        args: {},
        handler: async () => {
          ran = true;
          return "ok";
        },
      }),
    );
    assert.equal(await ok.handler(fakeCtx, {}), "ok");
    assert.equal(ran, true);

    /* owner-only blocks a member, and the handler never runs */
    let blockedRan = false;
    const blocked = exec(
      roleMutation("owner")({
        args: {},
        handler: async () => {
          blockedRan = true;
          return "nope";
        },
      }),
    );
    await assert.rejects(() => blocked.handler(fakeCtx, {}));
    assert.equal(blockedRan, false);
  });

  it("adminMutation ALLOWS owner/admin roles and BLOCKS member before the handler", async () => {
    let ownerRan = false;
    const ownerSpec = exec(
      makeFunctionsForRole("owner").adminMutation({
        args: {},
        handler: async () => {
          ownerRan = true;
          return "owner-ok";
        },
      }),
    );
    assert.equal(await ownerSpec.handler(fakeCtx, {}), "owner-ok");
    assert.equal(ownerRan, true);

    let adminRan = false;
    const adminSpec = exec(
      makeFunctionsForRole("admin").adminMutation({
        args: {},
        handler: async () => {
          adminRan = true;
          return "admin-ok";
        },
      }),
    );
    assert.equal(await adminSpec.handler(fakeCtx, {}), "admin-ok");
    assert.equal(adminRan, true);

    let memberRan = false;
    const memberSpec = exec(
      makeFunctionsForRole("member").adminMutation({
        args: {},
        handler: async () => {
          memberRan = true;
          return "nope";
        },
      }),
    );
    await assert.rejects(() => memberSpec.handler(fakeCtx, {}));
    assert.equal(memberRan, false);
  });

  it("adminQuery uses the same owner/admin gate", async () => {
    const ownerSpec = exec(
      makeFunctionsForRole("owner").adminQuery({
        args: {},
        handler: async (ctx) => ctx.viewer.membership.roleKey,
      }),
    );
    assert.equal(await ownerSpec.handler(fakeCtx, {}), "owner");

    let memberRan = false;
    const memberSpec = exec(
      makeFunctionsForRole("member").adminQuery({
        args: {},
        handler: async () => {
          memberRan = true;
          return "nope";
        },
      }),
    );
    await assert.rejects(() => memberSpec.handler(fakeCtx, {}));
    assert.equal(memberRan, false);
  });

  it("a raw (hand-rolled) mutation that skips the gate is NOT protected", async () => {
    let unsafeRan = false;
    /* This is what a consumer writes WITHOUT the factory: a raw builder, no gate. */
    const rawSpec = exec(
      fakeMutation({
        args: {},
        handler: async () => {
          unsafeRan = true;
          return "leaked";
        },
      }),
    );
    /*
     * Same under-privileged caller. Nothing stops it — proving the gate is the
     * thing doing the work, and that the matrix has teeth.
     */
    const result = await rawSpec.handler(fakeCtx, {});
    assert.equal(unsafeRan, true);
    assert.equal(result, "leaked");
  });
});

function isAuthErrorDenial(data: unknown): boolean {
  if (isAuthErrorPayload(data)) return true;
  /*
   * Our fake shapes the payload to match; accept either the real predicate or
   * the structural PERMISSION_REQUIRED shape.
   */
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { authzCode?: unknown }).authzCode === "PERMISSION_REQUIRED"
  );
}
