import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  createAuthorizationDenialAuditor,
  type AuthorizationDenialAuditEvent,
} from "./createAuthorizationDenialAuditor";

// ---------------------------------------------------------------------------
// Proof matrix for Increment 4a — the denial-audit emitter.
//
// THE drift invariant: a consumer wires emit + deriveContext ONCE and gets BOTH
// the `onAuthorizationDenied` factory hook AND a manual `auditAndRethrow` path.
// For the SAME denial, both paths MUST emit the identical structured event — a
// consumer cannot let the two drift apart.
// ---------------------------------------------------------------------------

type TestViewer = { user: { _id: string }; anchor: { _id: string } };
type TestCtx = { marker: "ctx" };
const ctx: TestCtx = { marker: "ctx" };

function only<T>(values: readonly T[], message: string): T {
  const [value] = values;
  assert.ok(value !== undefined, message);
  return value;
}

// A ConvexError-like error carrying the package's denied error data, the way the
// authz functions / a consumer's throwAuthorizationDenied actually throw it.
function deniedError(
  overrides: Partial<{
    denialReason: string;
    principalKind: string;
    principalId: string;
    organizationId: string;
    resourceType: string;
    resourceId: string;
    authzCode: string;
    permission: string;
    message: string;
    actorUserId: string;
  }> = {},
): { data: Record<string, unknown> } {
  return {
    data: {
      code: "FORBIDDEN",
      message: overrides.message ?? "Permission denied",
      denialReason: overrides.denialReason ?? "permission",
      principalKind: overrides.principalKind ?? "user",
      principalId: overrides.principalId ?? "user-1",
      organizationId: overrides.organizationId ?? "org-1",
      resourceType: overrides.resourceType ?? "convex.function",
      resourceId: overrides.resourceId ?? "app:reports.list",
      authzCode: overrides.authzCode ?? "PERMISSION_REQUIRED",
      permission: overrides.permission ?? "reports:read",
      actorUserId: overrides.actorUserId ?? "user-1",
    },
  };
}

type TestContext = {
  userId: string | null;
  organizationId: string | null;
  hasIdentity: boolean;
  hasLocalUser: boolean;
  hasActiveOrganization: boolean;
};

function makeAuditor(emitted: AuthorizationDenialAuditEvent<TestContext>[]) {
  return createAuthorizationDenialAuditor<TestViewer, TestCtx, TestContext>({
    emit: (event) => {
      emitted.push(event);
    },
    deriveContext: ({ viewer }) => ({
      userId: viewer ? viewer.user._id : null,
      organizationId: viewer ? viewer.anchor._id : null,
      hasIdentity: viewer !== null,
      hasLocalUser: viewer !== null,
      hasActiveOrganization: viewer !== null,
    }),
  });
}

describe("createAuthorizationDenialAuditor — drift-proof emission", () => {
  it("hook path and manual path emit the IDENTICAL event for the same denial", async () => {
    const emitted: AuthorizationDenialAuditEvent<TestContext>[] = [];
    const auditor = makeAuditor(emitted);
    const error = deniedError();
    const viewer: TestViewer = {
      user: { _id: "user-1" },
      anchor: { _id: "org-1" },
    };

    await auditor.onAuthorizationDenied(ctx, {
      permission: "reports:read",
      error,
      viewer,
    });
    await assert.rejects(() =>
      auditor.auditAndRethrow(ctx, {
        permission: "reports:read",
        error,
        viewer,
      }),
    );

    assert.equal(emitted.length, 2);
    assert.deepEqual(emitted[0], emitted[1]);
  });

  it("extracts the package payload from a denied error", async () => {
    const emitted: AuthorizationDenialAuditEvent<TestContext>[] = [];
    const auditor = makeAuditor(emitted);

    await auditor.onAuthorizationDenied(ctx, {
      permission: "reports:read",
      error: deniedError({
        denialReason: "permission",
        authzCode: "PERMISSION_REQUIRED",
      }),
      viewer: { user: { _id: "user-1" }, anchor: { _id: "org-1" } },
    });

    const event = emitted[0];
    assert.ok(event !== undefined && event.payload !== null);
    const payload = event.payload;
    assert.equal(payload.denialReason, "permission");
    assert.equal(payload.denialCode, "PERMISSION_REQUIRED");
    assert.equal(payload.principalKind, "user");
    assert.equal(payload.permission, "reports:read");
    assert.equal(event.permission, "reports:read");
  });

  it("still emits when the error carries no denied payload (payload null)", async () => {
    const emitted: AuthorizationDenialAuditEvent<TestContext>[] = [];
    const auditor = makeAuditor(emitted);

    await auditor.onAuthorizationDenied(ctx, {
      permission: "reports:read",
      error: new Error("resolution failed before any payload"),
      viewer: undefined,
    });

    assert.equal(emitted.length, 1);
    const event = only(emitted, "authorization denial event is missing");
    assert.equal(event.payload, null);
    // permission falls back to the explicit arg even with no payload.
    assert.equal(event.permission, "reports:read");
  });

  it("threads deriveContext with the resolved viewer, ctx, and error", async () => {
    const emitted: AuthorizationDenialAuditEvent<TestContext>[] = [];
    const seen: { viewer: TestViewer | null; ctx: TestCtx; error: unknown }[] = [];
    const auditor = createAuthorizationDenialAuditor<TestViewer, TestCtx, TestContext>({
      emit: (event) => {
        emitted.push(event);
      },
      deriveContext: (args) => {
        seen.push(args);
        return {
          userId: args.viewer?.user._id ?? null,
          organizationId: args.viewer?.anchor._id ?? null,
          hasIdentity: args.viewer !== null,
          hasLocalUser: args.viewer !== null,
          hasActiveOrganization: args.viewer !== null,
        };
      },
    });

    const error = deniedError();
    const viewer: TestViewer = {
      user: { _id: "user-9" },
      anchor: { _id: "org-9" },
    };
    await auditor.onAuthorizationDenied(ctx, {
      permission: "x",
      error,
      viewer,
    });

    assert.equal(seen.length, 1);
    const derivedContextCall = only(seen, "deriveContext call is missing");
    assert.equal(derivedContextCall.viewer, viewer);
    assert.equal(derivedContextCall.ctx, ctx);
    assert.equal(derivedContextCall.error, error);
    assert.deepEqual(only(emitted, "authorization denial event is missing").context, {
      userId: "user-9",
      organizationId: "org-9",
      hasIdentity: true,
      hasLocalUser: true,
      hasActiveOrganization: true,
    });
  });

  it("passes viewer:null to deriveContext when resolution failed (no viewer)", async () => {
    const emitted: AuthorizationDenialAuditEvent<TestContext>[] = [];
    const auditor = makeAuditor(emitted);

    await auditor.onAuthorizationDenied(ctx, {
      error: deniedError({
        denialReason: "organization",
        authzCode: "ORGANIZATION_REQUIRED",
      }),
      viewer: undefined,
    });

    assert.deepEqual(only(emitted, "authorization denial event is missing").context, {
      userId: null,
      organizationId: null,
      hasIdentity: false,
      hasLocalUser: false,
      hasActiveOrganization: false,
    });
  });

  it("auditAndRethrow re-throws the ORIGINAL error after emitting", async () => {
    const emitted: AuthorizationDenialAuditEvent<TestContext>[] = [];
    const auditor = makeAuditor(emitted);
    const error = deniedError();

    await assert.rejects(
      () =>
        auditor.auditAndRethrow(ctx, {
          permission: "reports:read",
          error,
          viewer: null,
        }),
      (thrown: unknown) => {
        assert.equal(thrown, error, "must re-throw the same error instance");
        return true;
      },
    );
    assert.equal(emitted.length, 1, "must emit exactly once before throwing");
  });

  it("awaits an async emit before auditAndRethrow throws", async () => {
    const order: string[] = [];
    const auditor = createAuthorizationDenialAuditor<TestViewer, TestCtx>({
      emit: async () => {
        await Promise.resolve();
        order.push("emitted");
      },
    });

    await assert.rejects(
      () => auditor.auditAndRethrow(ctx, { error: deniedError(), viewer: null }),
      () => {
        order.push("threw");
        return true;
      },
    );
    assert.deepEqual(order, ["emitted", "threw"]);
  });
});
