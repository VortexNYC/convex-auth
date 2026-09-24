import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./component/_generated/api";
import { hashApiKeySecret } from "./component/convex/src/machine/apiKeySecret";
import schema from "./component/schema";

/*
 * Presented-key verification.
 *
 * The pieces to do this always existed in the package -- `by_key_prefix` and
 * `verifyApiKeySecret` -- but nothing composed them, so every consumer wrote its own
 * hash-and-compare. convex-payments did exactly that and its auth layer drifted. These
 * assertions are what a consumer is entitled to rely on instead.
 */

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/apiKeys.ts": () => import("./component/apiKeys"),
};

const PRESENTED = "vb_test_0123456789abcdef0123456789abcdef";

async function seedKey(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
  presented: string = PRESENTED,
) {
  const keyHash = await hashApiKeySecret(presented);
  return await t.run(async (ctx) => {
    const now = Date.now();
    const ownerUserId = await ctx.db.insert("users", {
      email: `owner-${crypto.randomUUID()}@example.com`,
      name: "Owner",
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Convex",
      slug: `convex-${crypto.randomUUID()}`,
      status: "active",
      createdBy: ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    const apiKeyId = await ctx.db.insert("api_keys", {
      organizationId,
      userId: ownerUserId,
      name: "Test key",
      keyPrefix: presented.slice(0, 12),
      keyHash,
      keyStart: presented.slice(0, 12),
      environment: "sandbox",
      scopes: ["payments:read"],
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
    return { organizationId, ownerUserId, apiKeyId };
  });
}

describe("verifyApiKey", () => {
  it("accepts the real key and returns the tenancy a consumer needs", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedKey(t);

    const result = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: PRESENTED,
      environment: "sandbox",
    });

    expect(result).toMatchObject({
      valid: true,
      apiKeyId: seeded.apiKeyId,
      organizationId: seeded.organizationId,
      environment: "sandbox",
      scopes: ["payments:read"],
    });
  });

  it("records the use, so lastUsedAt is not something consumers must remember", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedKey(t);
    await t.mutation(api.apiKeys.verifyApiKey, { presentedKey: PRESENTED });

    const stored = await t.run(async (ctx) => await ctx.db.get("api_keys", seeded.apiKeyId));
    expect(stored?.lastUsedAt).toBeGreaterThan(0);
  });

  it("refuses a wrong secret that shares a real prefix, and says nothing about it", async () => {
    const t = convexTest(schema, modules);
    await seedKey(t);

    /* Same 12-char prefix, different secret: the prefix lookup hits, the hash must not. */
    const forged = `${PRESENTED.slice(0, 12)}ffffffffffffffffffffffffffff`;
    const result = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: forged,
    });

    /*
     * Deliberately identical to an unknown key. A distinguishable answer here would
     * confirm that a prefix names a real key -- a key-enumeration oracle.
     */
    expect(result).toEqual({ valid: false, reason: "not_found" });
    const unknown = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: "vb_test_nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn",
    });
    expect(unknown).toEqual(result);
  });

  it("refuses a sandbox key on a production request", async () => {
    const t = convexTest(schema, modules);
    await seedKey(t);

    /*
     * The reason this is a typed column and not metadata: it decides whether a request
     * can move real money.
     */
    const result = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: PRESENTED,
      environment: "production",
    });
    expect(result).toEqual({ valid: false, reason: "environment_mismatch" });
  });

  it("refuses revoked and expired keys", async () => {
    const t = convexTest(schema, modules);
    await seedKey(t, { status: "revoked" });
    expect(await t.mutation(api.apiKeys.verifyApiKey, { presentedKey: PRESENTED })).toEqual({
      valid: false,
      reason: "revoked",
    });

    const t2 = convexTest(schema, modules);
    await seedKey(t2, { expiresAt: Date.now() - 1 });
    expect(await t2.mutation(api.apiKeys.verifyApiKey, { presentedKey: PRESENTED })).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("enforces required scopes", async () => {
    const t = convexTest(schema, modules);
    await seedKey(t);
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: PRESENTED,
        requiredScopes: ["payments:write"],
      }),
    ).toEqual({ valid: false, reason: "scope_missing" });
  });

  it("rate limits within the window, and a rejected request does not consume budget", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedKey(t, {
      rateLimitEnabled: true,
      rateLimitMax: 2,
      rateLimitTimeWindowMs: 60_000,
    });
    const at = Date.now();

    for (const attempt of [1, 2]) {
      const ok = await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: PRESENTED,
        now: at,
      });
      expect(ok, `attempt ${attempt}`).toMatchObject({ valid: true });
    }
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: PRESENTED,
        now: at,
      }),
    ).toEqual({ valid: false, reason: "rate_limited" });

    /* The rejected call must not have counted as a use. */
    const stored = await t.run(async (ctx) => await ctx.db.get("api_keys", seeded.apiKeyId));
    expect(stored?.requestCount).toBe(2);

    /* A new window admits it again. */
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: PRESENTED,
        now: at + 60_001,
      }),
    ).toMatchObject({ valid: true });
  });

  it("exhausts a quota and refills it on the interval", async () => {
    const t = convexTest(schema, modules);
    const at = Date.now();
    await seedKey(t, {
      remaining: 1,
      refillAmount: 3,
      refillIntervalMs: 3_600_000,
      lastRefillAt: at,
    });

    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: PRESENTED,
        now: at,
      }),
    ).toMatchObject({ valid: true, remaining: 0 });
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: PRESENTED,
        now: at + 1,
      }),
    ).toEqual({ valid: false, reason: "quota_exhausted" });

    /*
     * Refill happens before the check, so the key works on THIS request rather than the
     * one after it.
     */
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: PRESENTED,
        now: at + 3_600_001,
      }),
    ).toMatchObject({ valid: true, remaining: 2 });
  });

  it("round-trips: a key issued by Core verifies through Core (PAY-74)", async () => {
    /*
     * The whole point of generation living in the component. If issuance and
     * verification disagree about the prefix, the key can never be found again --
     * and a consumer that generated its own format would never notice until runtime.
     */
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        email: `owner-${crypto.randomUUID()}@example.com`,
        name: "Owner",
        emailVerified: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "Convex",
        slug: `convex-${crypto.randomUUID()}`,
        status: "active",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, organizationId };
    });

    const issued = await t.mutation(api.apiKeys.issueApiKey, {
      organizationId: seeded.organizationId,
      userId: seeded.userId,
      name: "Live key",
      environment: "production",
      scopes: ["payments:write"],
    });

    expect(issued.apiKey).toMatch(/^vb_live_[0-9a-f]{48}$/u);
    /* The plaintext must not be recoverable from storage. */
    const stored = await t.run(async (ctx) => await ctx.db.get("api_keys", issued.apiKeyId));
    expect(JSON.stringify(stored)).not.toContain(issued.apiKey);
    expect(stored?.keyStart).toBe(issued.apiKey.slice(0, 12));

    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: issued.apiKey,
        environment: "production",
        requiredScopes: ["payments:write"],
      }),
    ).toMatchObject({
      valid: true,
      apiKeyId: issued.apiKeyId,
      organizationId: seeded.organizationId,
      environment: "production",
    });

    /* And the same key is refused on the other environment. */
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: issued.apiKey,
        environment: "sandbox",
      }),
    ).toEqual({ valid: false, reason: "environment_mismatch" });
  });

  it("refuses an empty key without touching the database", async () => {
    const t = convexTest(schema, modules);
    await seedKey(t);
    expect(await t.mutation(api.apiKeys.verifyApiKey, { presentedKey: "   " })).toEqual({
      valid: false,
      reason: "malformed",
    });
  });
});

async function seedPrincipal(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: `operator-${crypto.randomUUID()}@example.com`,
      name: "Operator",
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Convex",
      slug: `convex-${crypto.randomUUID()}`,
      status: "active",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    const servicePrincipalId = await ctx.db.insert("service_principals", {
      key: `payments-api-${crypto.randomUUID()}`,
      name: "Payments API",
      status: "active",
      organizationId,
      permissions: ["payments:issue"],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
    return { organizationId, servicePrincipalId };
  });
}

describe("issueServiceOwnedApiKey", () => {
  it("round-trips: a service-owned key issued by Core verifies through Core (PAY-81)", async () => {
    /*
     * The issuance path for an org with no human attached: an operator minting a
     * merchant key. Generation must live here, or the consumer is pushed back to
     * hashing keys itself -- the drift verifyApiKey exists to end.
     */
    const t = convexTest(schema, modules);
    const seeded = await seedPrincipal(t);

    const issued = await t.mutation(api.apiKeys.issueServiceOwnedApiKey, {
      servicePrincipalId: seeded.servicePrincipalId,
      name: "Merchant key",
      environment: "production",
      scopes: ["payments:production:operator"],
    });

    expect(issued.apiKey).toMatch(/^vb_live_[0-9a-f]{48}$/u);
    const stored = await t.run(async (ctx) => await ctx.db.get("api_keys", issued.apiKeyId));
    expect(JSON.stringify(stored)).not.toContain(issued.apiKey);
    expect(stored?.ownerType).toBe("service");
    expect(stored?.ownerServicePrincipalId).toBe(seeded.servicePrincipalId);
    expect(stored?.userId).toBeUndefined();

    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: issued.apiKey,
        environment: "production",
        requiredScopes: ["payments:production:operator"],
      }),
    ).toMatchObject({
      valid: true,
      apiKeyId: issued.apiKeyId,
      organizationId: seeded.organizationId,
      environment: "production",
    });

    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: issued.apiKey,
        environment: "sandbox",
      }),
    ).toEqual({ valid: false, reason: "environment_mismatch" });
  });

  it("refuses an inactive service principal", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPrincipal(t, { status: "disabled" });

    await expect(
      t.mutation(api.apiKeys.issueServiceOwnedApiKey, {
        servicePrincipalId: seeded.servicePrincipalId,
        name: "Merchant key",
        environment: "sandbox",
      }),
    ).rejects.toThrow("Only active service principals can issue API keys");
  });

  it("refuses key permissions the principal does not hold", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedPrincipal(t);

    await expect(
      t.mutation(api.apiKeys.issueServiceOwnedApiKey, {
        servicePrincipalId: seeded.servicePrincipalId,
        name: "Merchant key",
        environment: "sandbox",
        permissions: ["payments:admin"],
      }),
    ).rejects.toThrow("API key permissions exceed service principal permissions");
  });
});

describe("api_keys read APIs on issued keys", () => {
  it("getApiKey and listApiKeysByOrganization return keys that carry issuance fields", async () => {
    /*
     * Regression: apiKeyDocValidator omitted the issuance-era fields (environment,
     * keyStart, rate-limit and quota counters). Convex output validation is exact, so
     * every read API THREW on any key that issueApiKey or verifyApiKey had touched.
     * The reads here go through the component API, not ctx.db, on purpose.
     */
    const t = convexTest(schema, modules);
    const seeded = await seedPrincipal(t);

    const issued = await t.mutation(api.apiKeys.issueServiceOwnedApiKey, {
      servicePrincipalId: seeded.servicePrincipalId,
      name: "Merchant key",
      environment: "sandbox",
      rateLimitEnabled: true,
      rateLimitMax: 100,
      remaining: 1000,
      refillAmount: 1000,
      refillIntervalMs: 3_600_000,
    });
    /* Touch the rate-limit counters so the doc holds every optional field family. */
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: issued.apiKey,
      }),
    ).toMatchObject({ valid: true });

    const fetched = await t.query(api.apiKeys.getApiKey, {
      apiKeyId: issued.apiKeyId,
    });
    expect(fetched).toMatchObject({
      _id: issued.apiKeyId,
      environment: "sandbox",
      keyStart: issued.keyStart,
    });

    const listed = await t.query(api.apiKeys.listApiKeysByOrganization, {
      organizationId: seeded.organizationId,
    });
    expect(listed.map((key) => key._id)).toContain(issued.apiKeyId);
  });
});

describe("upsertServiceOwnedApiKey with environment", () => {
  it("stores the environment so an upserted deterministic key verifies like an issued one", async () => {
    /*
     * Proof harnesses upsert keys with a known plaintext (hashed via Core's
     * hashApiKeySecret) instead of minting. Without environment on the upsert
     * surface those keys can never pass an environment-checked verify.
     */
    const t = convexTest(schema, modules);
    const seeded = await seedPrincipal(t);
    const presented = "vb_test_proof_deterministic_key_0001";

    const upserted = await t.mutation(api.apiKeys.upsertServiceOwnedApiKey, {
      servicePrincipalId: seeded.servicePrincipalId,
      name: "Proof key",
      keyPrefix: presented.slice(0, 12),
      keyHash: await hashApiKeySecret(presented),
      environment: "sandbox",
      scopes: ["payments:sandbox:merchant"],
    });

    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: presented,
        environment: "sandbox",
      }),
    ).toMatchObject({
      valid: true,
      apiKeyId: upserted.apiKeyId,
      organizationId: seeded.organizationId,
      environment: "sandbox",
    });
    expect(
      await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: presented,
        environment: "production",
      }),
    ).toEqual({ valid: false, reason: "environment_mismatch" });
  });
});
