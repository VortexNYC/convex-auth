import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { createApiKeyScopeRegistry, type ApiKeyScopeFromDescriptors } from "./api-key-scopes";

const billingApiScopeDescriptors = [
  {
    scope: "billing:customers:read",
    label: "Read customers",
    requiredPermissions: ["customers:view"],
    defaultSelected: true,
  },
  {
    scope: "billing:invoices:write",
    label: "Write invoices",
    requiredPermissions: ["invoices:create", "invoices:edit"],
  },
  {
    scope: "billing:webhooks:manage",
    label: "Manage webhooks",
    requiredPermissions: ["settings:manage"],
  },
] as const;

type BillingApiScope = ApiKeyScopeFromDescriptors<typeof billingApiScopeDescriptors>;

const billingApiScopeRegistry = createApiKeyScopeRegistry(billingApiScopeDescriptors);

function normalizeBillingApiScopes(scopes: readonly string[]): BillingApiScope[] {
  return billingApiScopeRegistry.requireKnownScopes(scopes);
}

function canBillingActorUseScope(permissions: readonly string[], scope: BillingApiScope): boolean {
  return billingApiScopeRegistry.canUseScope(scope, permissions);
}

describe("API key scope registry consumer recipe", () => {
  it("derives an app-specific scope union and stable defaults from descriptors", () => {
    const selectedScope: BillingApiScope = "billing:customers:read";

    assert.equal(selectedScope, "billing:customers:read");
    assert.deepEqual(billingApiScopeRegistry.scopes, [
      "billing:customers:read",
      "billing:invoices:write",
      "billing:webhooks:manage",
    ]);
    assert.deepEqual(billingApiScopeRegistry.defaultScopes, ["billing:customers:read"]);
  });

  it("normalizes API key create inputs without accepting unknown scopes", () => {
    assert.deepEqual(
      normalizeBillingApiScopes([
        " billing:customers:read ",
        "billing:invoices:write",
        "billing:customers:read",
      ]),
      ["billing:customers:read", "billing:invoices:write"],
    );
    assert.throws(
      () => normalizeBillingApiScopes(["billing:admin:god-mode"]),
      /Unknown API key scope: billing:admin:god-mode/,
    );
  });

  it("maps app-specific scopes back to current owner permissions", () => {
    assert.equal(canBillingActorUseScope(["customers:view"], "billing:customers:read"), true);
    assert.equal(canBillingActorUseScope(["invoices:*"], "billing:invoices:write"), true);
    assert.equal(canBillingActorUseScope(["*"], "billing:webhooks:manage"), true);
    assert.equal(canBillingActorUseScope(["customers:view"], "billing:invoices:write"), false);
  });
});
