import assert from "node:assert/strict";

import { permissionMatcherConformanceCases } from "../../core";
import { describe, it } from "vitest";

import { assembleViewerContext, sessionIdFromConvexIdentity } from "./assembleViewerContext";

describe("assembleViewerContext", () => {
  for (const testCase of permissionMatcherConformanceCases) {
    it(`shared conformance: ${testCase.name}`, () => {
      const viewer = assembleViewerContext({
        identity: {
          subject: "u1",
          issuer: "issuer",
          tokenIdentifier: "issuer|u1",
        },
        localIdentity: { _id: "identity_1" },
        user: { _id: "user_1" },
        userId: "user_1",
        identityId: "identity_1",
        access: {
          activeOrganizationId: "org_1",
          membershipIds: ["membership_1"],
          roleKeys: ["member"],
          permissions: [...testCase.granted],
        },
        isRestricted: false,
        restrictedReason: null,
      });
      assert.equal(viewer.hasPermission(testCase.required), testCase.expected);
    });
  }

  it("assembles a generic viewer shape with resolved auth context", () => {
    const viewer = assembleViewerContext({
      identity: {
        subject: "external-user-123",
        issuer: "https://issuer.example",
        tokenIdentifier: "issuer|identity_123",
        sessionId: "session_123",
      },
      localIdentity: { _id: "identity_123" },
      user: { _id: "user_123", isActive: true },
      userId: "user_123",
      identityId: "identity_123",
      access: {
        activeOrganizationId: "org_123",
        membershipIds: ["membership_1"],
        roleKeys: ["owner"],
        permissions: ["org:read", "org:manage_roles"],
      },
      isRestricted: false,
      restrictedReason: null,
    });

    assert.equal(viewer.identity.subject, "external-user-123");
    assert.equal(viewer.localIdentity._id, "identity_123");
    assert.equal(viewer.user._id, "user_123");
    assert.equal(viewer.authContext.principal.kind, "user");
    assert.equal(viewer.authContext.principal.userId, "user_123");
    assert.equal(viewer.authContext.principal.identityId, "identity_123");
    assert.equal(viewer.authContext.principal.sessionId, "session_123");
    assert.equal(viewer.authContext.execution.organizationId, "org_123");
    assert.deepEqual(viewer.permissions, ["org:read", "org:manage_roles"]);
    assert.equal(viewer.hasPermission("org:manage_roles"), true);
    assert.equal(viewer.hasPermission("org:missing"), false);
  });

  it("extracts session id from sessionId or sid claims", () => {
    assert.equal(
      sessionIdFromConvexIdentity({
        subject: "u1",
        issuer: "issuer",
        tokenIdentifier: "issuer|u1",
        sessionId: "session_1",
      }),
      "session_1",
    );

    assert.equal(
      sessionIdFromConvexIdentity({
        subject: "u1",
        issuer: "issuer",
        tokenIdentifier: "issuer|u1",
        sid: "session_2",
      }),
      "session_2",
    );

    assert.equal(
      sessionIdFromConvexIdentity({
        subject: "u1",
        issuer: "issuer",
        tokenIdentifier: "issuer|u1",
      }),
      null,
    );
  });
});
