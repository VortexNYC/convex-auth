import assert from "node:assert/strict";

import { permissionMatcherConformanceCases } from "../../compat/permissions";
import { actionGeneric } from "convex/server";
import { describe, it } from "vitest";

import { isAuthErrorPayload } from "../glue/throwAuthError";
import {
  createConvexAuthActionFunctions,
  type ActionAuthSnapshot,
} from "./createConvexAuthActionFunctions";

/**
 * Proof matrix for Increment 5b-action — permission-gated ACTIONS.
 * Actions cannot read the db, so the wrapper resolves auth via a consumer
 * snapshot resolver (an internal query that runs the glue), reconstructs a
 * lightweight viewer, gates BEFORE the handler, and injects the viewer. The
 * invariant matches the query/mutation wrappers: the check is baked into the
 * builder and the handler body is unreachable on a denial.
 */

/*
 * Fake builder: convex-helpers calls builder({ args, handler }), so the returned
 * spec's `handler` IS the composed gate -> userHandler pipeline.
 */
const fakeAction = actionGeneric;
const exec = (registered: unknown) => {
  if ((typeof registered !== "object" && typeof registered !== "function") || registered === null) {
    throw new TypeError("expected an executable spec");
  }
  const handler = Reflect.get(registered, "_handler");
  if (typeof handler !== "function") {
    throw new TypeError("expected an executable handler");
  }
  return {
    handler: async (ctx: unknown, args: Record<string, unknown>) =>
      await Reflect.apply(handler, registered, [ctx, args]),
  };
};

function readAuthzCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const data = Reflect.get(error, "data");
  return typeof data === "object" && data !== null ? Reflect.get(data, "authzCode") : undefined;
}

const fakeCtx = {
  auth: { getUserIdentity: async () => ({ subject: "u1", issuer: "test" }) },
  runQuery: async () => null,
} as unknown;

function snapshot(overrides: Partial<ActionAuthSnapshot> = {}): ActionAuthSnapshot {
  return {
    userId: "user_1",
    organizationId: "org_local_1",
    convexAuthOrganizationId: "vao_1",
    role: "member",
    permissions: ["widgets:view"],
    ...overrides,
  };
}

function makeFunctions(
  resolved: ActionAuthSnapshot | null,
  onAuthorizationDenied?: Parameters<
    typeof createConvexAuthActionFunctions
  >[0]["onAuthorizationDenied"],
) {
  return createConvexAuthActionFunctions({
    action: fakeAction,
    resolveAuthSnapshot: async () => resolved,
    onAuthorizationDenied,
  });
}

describe("createConvexAuthActionFunctions — security contract", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(`permission conformance: ${testCase.name}`, async () => {
      const { authedAction } = makeFunctions(snapshot({ permissions: testCase.granted }));
      const spec = exec(
        authedAction({
          args: {},
          handler: async (ctx: { viewer: { hasPermission: (permission: string) => boolean } }) =>
            ctx.viewer.hasPermission(testCase.required),
        }),
      );
      assert.equal(await spec.handler(fakeCtx, {}), testCase.expected);
    });
  }

  it("authedAction injects the reconstructed action viewer", async () => {
    const { authedAction } = makeFunctions(snapshot());
    const spec = exec(
      authedAction({
        args: {},
        handler: async (ctx: { viewer: { userId: string; role: string } }) =>
          `${ctx.viewer.userId}:${ctx.viewer.role}`,
      }),
    );
    assert.equal(await spec.handler(fakeCtx, {}), "user_1:member");
  });

  it("permissionAction RUNS the handler when the viewer has the permission", async () => {
    let ran = false;
    const { permissionAction } = makeFunctions(
      snapshot({ permissions: ["widgets:view", "widgets:edit"] }),
    );
    const spec = exec(
      permissionAction("widgets:edit")({
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

  it("permissionAction BLOCKS before the handler when the permission is missing", async () => {
    let ran = false;
    const { permissionAction } = makeFunctions(snapshot({ permissions: ["widgets:view"] }));
    const spec = exec(
      permissionAction("widgets:edit")({
        args: {},
        handler: async () => {
          ran = true;
          return "leaked";
        },
      }),
    );
    await assert.rejects(
      () => spec.handler(fakeCtx, {}),
      (err: { data?: unknown }) => {
        assert.ok(isDenial(err.data), "expected a PERMISSION_REQUIRED denial");
        return true;
      },
    );
    assert.equal(ran, false, "action handler must not run when permission is denied");
  });

  it("AUTHENTICATION_REQUIRED when the snapshot resolves to null (handler never runs)", async () => {
    let ran = false;
    const { permissionAction } = makeFunctions(null);
    const spec = exec(
      permissionAction("widgets:view")({
        args: {},
        handler: async () => {
          ran = true;
          return "leaked";
        },
      }),
    );
    await assert.rejects(
      () => spec.handler(fakeCtx, {}),
      (err: { data?: { authzCode?: unknown } }) => {
        assert.equal(err.data?.authzCode, "AUTHENTICATION_REQUIRED");
        return true;
      },
    );
    assert.equal(ran, false);
  });

  it("permissionAnyAction allows on ANY held; permissionAllAction blocks on ANY missing", async () => {
    const { permissionAnyAction, permissionAllAction } = makeFunctions(
      snapshot({ permissions: ["widgets:view"] }),
    );
    /* any: holds view → allowed */
    const anyOk = exec(
      permissionAnyAction(["widgets:edit", "widgets:view"])({
        args: {},
        handler: async () => "ok",
      }),
    );
    assert.equal(await anyOk.handler(fakeCtx, {}), "ok");
    /* all: missing edit → blocked */
    const allBlocked = exec(
      permissionAllAction(["widgets:view", "widgets:edit"])({
        args: {},
        handler: async () => "nope",
      }),
    );
    await assert.rejects(() => allBlocked.handler(fakeCtx, {}));
  });

  it("roleAction allows the matching role and blocks others", async () => {
    const { roleAction } = makeFunctions(snapshot({ role: "member" }));
    const ok = exec(roleAction("member", "owner")({ args: {}, handler: async () => "ok" }));
    assert.equal(await ok.handler(fakeCtx, {}), "ok");
    const blocked = exec(roleAction("owner")({ args: {}, handler: async () => "nope" }));
    await assert.rejects(() => blocked.handler(fakeCtx, {}));
  });

  it("fires onAuthorizationDenied before re-throwing on a permission denial", async () => {
    const denials: Array<{ permission?: string; authzCode?: unknown }> = [];
    const { permissionAction } = makeFunctions(
      snapshot({ permissions: ["widgets:view"] }),
      (_ctx, { permission, error }) => {
        denials.push({ permission, authzCode: readAuthzCode(error) });
      },
    );
    const spec = exec(
      permissionAction("widgets:edit")({
        args: {},
        handler: async () => "nope",
      }),
    );
    await assert.rejects(() => spec.handler(fakeCtx, {}));
    assert.deepEqual(denials, [{ permission: "widgets:edit", authzCode: "PERMISSION_REQUIRED" }]);
  });
});

function isDenial(data: unknown): boolean {
  return (
    isAuthErrorPayload(data) ||
    (typeof data === "object" &&
      data !== null &&
      (data as { authzCode?: unknown }).authzCode === "PERMISSION_REQUIRED")
  );
}
