import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./component/_generated/api";
import { hashApiKeySecret } from "./component/convex/src/machine/apiKeySecret";
import schema from "./component/schema";
import { NEVER_ISSUABLE_SCOPES } from "./scopes";

/*
 * Two auth-architecture properties consumers cannot build for themselves (VOR-179).
 *
 * 1. THE CREDENTIAL DETERMINES THE PRINCIPAL TYPE.
 *
 *    `verifyApiKey` used to answer "which organization, and what scopes" -- which
 *    cannot express "this route is closed to machines" or "agents get their own
 *    rate-limit budget". `ownerType` was already on the row; it simply never
 *    reached the caller, so every consumer had an org id and no idea what kind of
 *    thing was holding it.
 *
 *    A principal type is not a flag on a user. Polar models it as a union of
 *    Subject types (User | Organization | Customer | Anonymous) precisely so an
 *    endpoint can structurally exclude a class of caller, and so rate limits key
 *    by class. We carry `human | service | agent`, with a rate-limit identity that
 *    differs by class -- agents burst differently from browsers, and that has to
 *    be true on day one rather than retrofitted.
 *
 * 2. A CREDENTIAL CANNOT MINT A CREDENTIAL.
 *
 *    A key that can issue keys self-replicates, so one leak is unrecoverable.
 *    convex-payments closed the symptom by deleting its mint route (#132); the
 *    durable form is here: a declared never-issuable scope set that issuance
 *    refuses to grant, at the only layer that can enforce it for every consumer.
 */

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/apiKeys.ts": () => import("./component/apiKeys"),
};

async function seedOrgAndUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
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
}

async function seedKeyWithOwner(
  t: ReturnType<typeof convexTest>,
  ownerType: "user" | "service" | "organization",
  presented: string,
  extra: Record<string, unknown> = {},
) {
  const { userId, organizationId } = await seedOrgAndUser(t);
  const keyHash = await hashApiKeySecret(presented);
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("api_keys", {
      organizationId,
      userId,
      name: `${ownerType} key`,
      keyPrefix: presented.slice(0, 12),
      keyHash,
      keyStart: presented.slice(0, 12),
      environment: "sandbox",
      ownerType,
      scopes: ["payments:read"],
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...extra,
    });
  });
  return { userId, organizationId };
}

describe("the credential determines the principal type", () => {
  it("a user-owned key verifies as a human principal", async () => {
    const t = convexTest(schema, modules);
    const presented = "vb_test_human000000000000000000000000";
    const { userId } = await seedKeyWithOwner(t, "user", presented);

    const result = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: presented,
    });

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    expect(result.principal.type).toBe("human");
    expect(result.principal.id).toBe(userId);
  });

  it("a service-owned key verifies as a service principal, not a human", async () => {
    const t = convexTest(schema, modules);
    const presented = "vb_test_service00000000000000000000000";
    await seedKeyWithOwner(t, "service", presented);

    const result = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: presented,
    });

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    /*
     * The whole point: a consumer can now refuse machine callers on a route that
     * must be driven by a person. Before this, both keys looked identical.
     */
    expect(result.principal.type).toBe("service");
    expect(result.principal.type).not.toBe("human");
  });

  it("rate-limit identity differs by principal class, so agents cannot spend a human's budget", async () => {
    const t = convexTest(schema, modules);
    const humanKey = "vb_test_humanrate0000000000000000000";
    const serviceKey = "vb_test_servicerate00000000000000000";
    await seedKeyWithOwner(t, "user", humanKey);
    await seedKeyWithOwner(t, "service", serviceKey);

    const human = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: humanKey,
    });
    const service = await t.mutation(api.apiKeys.verifyApiKey, {
      presentedKey: serviceKey,
    });

    expect(human.valid && service.valid).toBe(true);
    if (!human.valid || !service.valid) {
      return;
    }
    expect(human.principal.rateLimitKey.startsWith("human:")).toBe(true);
    expect(service.principal.rateLimitKey.startsWith("service:")).toBe(true);
    expect(human.principal.rateLimitKey).not.toBe(service.principal.rateLimitKey);
  });
});

describe("a credential cannot mint a credential", () => {
  it("declares the issuance scopes as never issuable", () => {
    /*
     * Not vacuous, and not silently empty: the set must actually name the
     * scopes that grant issuance.
     */
    expect(NEVER_ISSUABLE_SCOPES.length).toBeGreaterThan(0);
    expect(NEVER_ISSUABLE_SCOPES).toContain("auth:api-keys:issue");
  });

  it("issueApiKey refuses to grant a never-issuable scope", async () => {
    const t = convexTest(schema, modules);
    const { userId, organizationId } = await seedOrgAndUser(t);

    await expect(
      t.mutation(api.apiKeys.issueApiKey, {
        organizationId,
        userId,
        name: "self replicating key",
        environment: "sandbox",
        scopes: ["payments:read", "auth:api-keys:issue"],
      }),
    ).rejects.toThrow(/never issuable/iu);
  });

  it("issueServiceOwnedApiKey refuses too -- machine callers are the higher risk", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await seedOrgAndUser(t);
    const servicePrincipalId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("service_principals", {
        organizationId,
        key: `payments-api-${organizationId}`,
        name: "payments api",
        status: "active",
        permissions: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(api.apiKeys.issueServiceOwnedApiKey, {
        servicePrincipalId,
        name: "self replicating service key",
        environment: "sandbox",
        scopes: ["auth:api-keys:issue"],
      }),
    ).rejects.toThrow(/never issuable/iu);
  });

  it("still issues ordinary scopes, so the guard is a boundary and not a wall", async () => {
    const t = convexTest(schema, modules);
    const { userId, organizationId } = await seedOrgAndUser(t);

    const issued = await t.mutation(api.apiKeys.issueApiKey, {
      organizationId,
      userId,
      name: "ordinary key",
      environment: "sandbox",
      scopes: ["payments:read", "payments:write"],
    });

    expect(issued.apiKey.length).toBeGreaterThan(0);
  });
});

describe("the principal union promises only what it can deliver", () => {
  it("every type in the union is reachable from some credential", async () => {
    /*
     * An earlier revision carried "agent" in the union while no code path could
     * ever return it, so `if (principal.type === "agent")` was silently dead in
     * every consumer. A validator literal nothing can produce is a promise we do
     * not keep. This pins the union to what the resolver actually returns.
     */
    const t = convexTest(schema, modules);
    const observed = new Set<string>();

    for (const [ownerType, presented] of [
      /**
       * The first 12 characters are the indexed lookup prefix, so these must
       * differ there -- a shared prefix makes every seed resolve to one key.
       */
      ["user", "vb_humanreach_0000000000000000000000"],
      ["service", "vb_svcreach_00000000000000000000000"],
      ["organization", "vb_orgreach_00000000000000000000000"],
    ] as const) {
      await seedKeyWithOwner(t, ownerType, presented);
      const result = await t.mutation(api.apiKeys.verifyApiKey, {
        presentedKey: presented,
      });
      if (result.valid) {
        observed.add(result.principal.type);
      }
    }

    /* Exactly the set the resolver can produce -- no more, no less. */
    expect([...observed].toSorted()).toEqual(["human", "service"]);
  });
});
