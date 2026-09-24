/**
 * Coverage for `resolveApiKeyPrincipal` — the helper that turns a stored
 * ApiKey record + its owner's permissions into a canonical
 * `ApiKeyPrincipal`. The inheritedPermissions / narrowedPermissions /
 * effectivePermissions triple is the contract every API auth code path
 * downstream depends on.
 */
import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { resolveApiKeyPrincipal } from "./resolveApiKeyPrincipal";

describe("resolveApiKeyPrincipal", () => {
  it("returns kind='apiKey' with the input apiKeyId / ownerType / ownerId", () => {
    const p = resolveApiKeyPrincipal({
      apiKeyId: "ak_1",
      ownerType: "user",
      ownerId: "u_1",
      fixedOrganizationId: "org_1",
      permissions: null,
      ownerPermissions: ["org:read"],
    });
    assert.equal(p.kind, "apiKey");
    assert.equal(p.apiKeyId, "ak_1");
    assert.equal(p.ownerType, "user");
    assert.equal(p.ownerId, "u_1");
  });

  it("organizationId comes from fixedOrganizationId on the record", () => {
    const p = resolveApiKeyPrincipal({
      apiKeyId: "ak_1",
      ownerType: "service",
      ownerId: "svc_1",
      fixedOrganizationId: "org_pinned",
      permissions: null,
      ownerPermissions: [],
    });
    assert.equal(p.organizationId, "org_pinned");
  });

  it("inheritedPermissions clones ownerPermissions (no aliasing)", () => {
    const ownerPermissions = ["org:read", "org:write"];
    const p = resolveApiKeyPrincipal({
      apiKeyId: "ak_1",
      ownerType: "user",
      ownerId: "u_1",
      fixedOrganizationId: null,
      permissions: null,
      ownerPermissions,
    });
    assert.deepEqual(p.inheritedPermissions, ["org:read", "org:write"]);
    assert.notEqual(p.inheritedPermissions, ownerPermissions, "should clone");
  });

  it("narrowedPermissions=null → effectivePermissions inherits owner's", () => {
    const p = resolveApiKeyPrincipal({
      apiKeyId: "ak_1",
      ownerType: "user",
      ownerId: "u_1",
      fixedOrganizationId: null,
      permissions: null,
      ownerPermissions: ["org:read", "org:write"],
    });
    assert.equal(p.narrowedPermissions, null);
    assert.deepEqual(p.effectivePermissions.toSorted(), ["org:read", "org:write"]);
  });

  it("narrowedPermissions=[…] → effectivePermissions is the narrowed intersection", () => {
    const p = resolveApiKeyPrincipal({
      apiKeyId: "ak_1",
      ownerType: "user",
      ownerId: "u_1",
      fixedOrganizationId: null,
      permissions: ["org:read"],
      ownerPermissions: ["org:read", "org:write", "billing:read"],
    });
    assert.deepEqual(p.narrowedPermissions, ["org:read"]);
    /* The intersection of owner and the api key's permissions. */
    assert.deepEqual(p.effectivePermissions, ["org:read"]);
  });

  it("isRestricted defaults to false when input omits it", () => {
    const p = resolveApiKeyPrincipal({
      apiKeyId: "ak_1",
      ownerType: "user",
      ownerId: "u_1",
      fixedOrganizationId: null,
      permissions: null,
      ownerPermissions: [],
    });
    assert.equal(p.isRestricted, false);
    assert.equal(p.restrictedReason, null);
  });

  it("isRestricted=true + restrictedReason propagate", () => {
    const p = resolveApiKeyPrincipal({
      apiKeyId: "ak_1",
      ownerType: "user",
      ownerId: "u_1",
      fixedOrganizationId: null,
      permissions: null,
      ownerPermissions: [],
      isRestricted: true,
      restrictedReason: "ip-blocked",
    });
    assert.equal(p.isRestricted, true);
    assert.equal(p.restrictedReason, "ip-blocked");
  });

  it("ownerType variants ('user' | 'organization' | 'service') round-trip", () => {
    for (const ownerType of ["user", "organization", "service"] as const) {
      const p = resolveApiKeyPrincipal({
        apiKeyId: "ak_1",
        ownerType,
        ownerId: "id_1",
        fixedOrganizationId: null,
        permissions: null,
        ownerPermissions: [],
      });
      assert.equal(p.ownerType, ownerType);
    }
  });
});
