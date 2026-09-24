import assert from "node:assert/strict";

import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_MD_SIGNING_ALGORITHM,
  createAuthMdServiceAuthRuntime,
  type AuthMdServiceAuthMutationCtx,
} from "./auth-md";
import { api } from "./component/_generated/api";
import schema from "./component/schema";

/*
 * The auth.md runtime, driven against the REAL component.
 *
 * This replaces a version that hand-rolled `Symbol()` stand-ins for component function
 * references and cast them into the handle type. That double could only ever confirm
 * the runtime called the reference it was told to call -- it asserted the test's own
 * fiction of what the component does, never the component. Two of the three casts the
 * lint gate flagged came from it.
 *
 * Passing the real `api` is possible because the handle now accepts a reference at
 * either visibility: the component's own `api` is public inside the component, while a
 * host sees `components.convexAuth` as internal, and the runtime cannot act on the
 * difference.
 *
 * Ids are therefore real and generated, so assertions are structural rather than
 * against invented literals like "credential-1".
 */

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/authMd.ts": () => import("./component/authMd"),
  "./component/identity.ts": () => import("./component/identity"),
  "./component/mcp.ts": () => import("./component/mcp"),
  "./component/organizations.ts": () => import("./component/organizations"),
};

const ISSUER = "https://auth.convex.nyc";
const RESOURCE = "https://chat.convex.nyc/";
const SUBJECT = "better-auth-user-1";
const PROVIDER = "better-auth";
const NOW_MS = 1_800_400_000_000;

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The component enforces a poll interval and returns `slow_down` if a client polls
 * before `nextPollAt`. The old hand-rolled double answered "claimed" immediately, so
 * the interval was never exercised. Time is controlled here instead of slept through.
 */
function advancePastPollWindow() {
  vi.setSystemTime(NOW_MS + 30_000);
}

async function createHarness() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_MS);
  const t = convexTest(schema, modules);
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });

  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: "owner@example.com",
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
    /*
     * Membership is required: the component checks the user's authority in the
     * organization before it will bind a claim. The previous hand-rolled double
     * asserted nothing about this, so the test passed without it.
     */
    const roleId = await ctx.db.insert("organization_roles", {
      organizationId,
      key: "owner",
      name: "Owner",
      permissions: ["chat:read", "chat:write"],
      isSystem: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organization_members", {
      organizationId,
      userId,
      roleId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    /*
     * The runtime resolves the caller's Convex identity to a Convex user through the
     * component, so the link has to exist for the ceremony to bind to anyone.
     */
    await ctx.db.insert("auth_identities", {
      identityId: `identity-${crypto.randomUUID()}`,
      userId,
      provider: PROVIDER,
      issuer: ISSUER,
      subject: SUBJECT,
      tokenIdentifier: `${ISSUER}|${SUBJECT}`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    /*
     * Signing keys are global in the component; without an active one the runtime
     * cannot mint or verify a token.
     */
    await ctx.db.insert("mcp_oauth_signing_keys", {
      keyId: "auth-md-key-1",
      algorithm: AUTH_MD_SIGNING_ALGORITHM,
      publicJwkJson: JSON.stringify(await exportJWK(publicKey)),
      privateJwkJson: JSON.stringify(await exportJWK(privateKey)),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, organizationId };
  });

  /*
   * No hand-built ctx. `t.run` hands over a REAL Convex mutation ctx, so runQuery and
   * runMutation genuinely execute the component, and `withIdentity` supplies the signed
   * in account the ceremony binds to. The previous version faked all three.
   */
  const identified = t.withIdentity({
    issuer: ISSUER,
    subject: SUBJECT,
    tokenIdentifier: `${ISSUER}|${SUBJECT}`,
    emailVerified: true,
  });

  const runtime = createAuthMdServiceAuthRuntime({
    component: api,
    issuer: ISSUER,
    resource: RESOURCE,
    scopesSupported: ["chat:read", "chat:write"],
    identityProvider: PROVIDER,
    buildVerificationUri: (token) =>
      `${ISSUER}/claim?claim_attempt_token=${encodeURIComponent(token)}`,
  });

  return {
    t,
    identified,
    runtime,
    organizationId: seeded.organizationId,
    userId: seeded.userId,
  };
}

/**
 * Runs a runtime call with a real Convex ctx. `authenticated: false` uses the
 * unidentified instance, which is how the unauthenticated path is exercised without
 * faking `ctx.auth`.
 */
function withCtx<T>(
  harness: Awaited<ReturnType<typeof createHarness>>,
  call: (ctx: AuthMdServiceAuthMutationCtx) => Promise<T>,
  options: { authenticated?: boolean } = {},
): Promise<T> {
  const instance = options.authenticated === false ? harness.t : harness.identified;
  return instance.run(async (ctx) => await call(ctx));
}

function claimAttemptToken(verificationUri: string): string {
  const token = new URL(verificationUri).searchParams.get("claim_attempt_token");
  assert.ok(token, "verification uri must carry a claim_attempt_token");
  return token;
}

describe("auth.md runtime against the real component", () => {
  it("runs the ceremony and keeps authority live until revocation", async () => {
    const harness = await createHarness();

    const registration = await withCtx(harness, (ctx) =>
      harness.runtime.registerServiceAuth(ctx, {
        loginHint: "owner@example.com",
        scopes: ["chat:write", "chat:read"],
      }),
    );
    assert.equal(registration.registration_type, "service_auth");
    assert.ok(registration.registration_id.length > 0);
    assert.deepEqual(registration.post_claim_scopes, ["chat:read", "chat:write"]);

    assert.deepEqual(
      await withCtx(harness, (ctx) =>
        harness.runtime.completeServiceAuthClaim(ctx, {
          claimAttemptToken: claimAttemptToken(registration.claim.verification_uri),
          userCode: registration.claim.user_code,
          organizationId: harness.organizationId,
        }),
      ),
      { ok: true, status: "claimed" },
    );

    advancePastPollWindow();
    const token = await withCtx(harness, (ctx) =>
      harness.runtime.pollServiceAuthClaim(ctx, {
        claimToken: registration.claim_token,
      }),
    );
    assert.ok("access_token" in token);
    assert.equal(token.token_type, "Bearer");
    assert.equal(typeof token.identity_assertion, "string");

    const principal = await withCtx(harness, (ctx) =>
      harness.runtime.authenticateAccessToken(ctx, {
        accessToken: token.access_token,
      }),
    );
    assert.equal(principal.kind, "user_delegation");
    assert.equal(principal.resource, RESOURCE);
    assert.equal(principal.organizationId, harness.organizationId);
    assert.equal(principal.userId, harness.userId);
    assert.deepEqual(principal.scopes, ["chat:read", "chat:write"]);

    /*
     * Refresh runs off the CREDENTIAL. Re-presenting the assertion is replaying an
     * authorization code, and the component consumes it on first use.
     */
    const refreshed = await withCtx(harness, (ctx) =>
      harness.runtime.refreshAccessToken(ctx, {
        accessToken: token.access_token,
      }),
    );
    assert.notEqual(refreshed.access_token, token.access_token);

    await expect(
      withCtx(harness, (ctx) =>
        harness.runtime.exchangeIdentityAssertion(ctx, {
          assertion: token.identity_assertion ?? "",
          resource: RESOURCE,
        }),
      ),
    ).rejects.toThrow(/invalid or consumed/);

    /* Rotation revoked the original credential, so its token no longer authenticates. */
    await expect(
      withCtx(harness, (ctx) =>
        harness.runtime.authenticateAccessToken(ctx, {
          accessToken: token.access_token,
        }),
      ),
    ).rejects.toThrow(/inactive/);

    await withCtx(harness, (ctx) =>
      harness.runtime.revokeAccessToken(ctx, {
        accessToken: refreshed.access_token,
      }),
    );
    await expect(
      withCtx(harness, (ctx) =>
        harness.runtime.authenticateAccessToken(ctx, {
          accessToken: refreshed.access_token,
        }),
      ),
    ).rejects.toThrow(/inactive/);
  });

  it("rejects unsupported scopes, unauthenticated claims, and wrong resources", async () => {
    const harness = await createHarness();

    await expect(
      withCtx(harness, (ctx) =>
        harness.runtime.registerServiceAuth(ctx, {
          loginHint: "owner@example.com",
          scopes: ["chat:admin"],
        }),
      ),
    ).rejects.toThrow(/scope is not supported/);

    const registration = await withCtx(harness, (ctx) =>
      harness.runtime.registerServiceAuth(ctx, {
        loginHint: "owner@example.com",
        scopes: ["chat:read"],
      }),
    );

    /* Unidentified instance: no signed-in account, so the claim cannot bind. */
    await expect(
      withCtx(
        harness,
        (ctx) =>
          harness.runtime.completeServiceAuthClaim(ctx, {
            claimAttemptToken: claimAttemptToken(registration.claim.verification_uri),
            userCode: registration.claim.user_code,
            organizationId: harness.organizationId,
          }),
        { authenticated: false },
      ),
    ).rejects.toThrow(/authenticated Convex account/);

    assert.deepEqual(
      await withCtx(harness, (ctx) =>
        harness.runtime.completeServiceAuthClaim(ctx, {
          claimAttemptToken: claimAttemptToken(registration.claim.verification_uri),
          userCode: registration.claim.user_code,
          organizationId: harness.organizationId,
        }),
      ),
      { ok: true, status: "claimed" },
    );

    advancePastPollWindow();
    const token = await withCtx(harness, (ctx) =>
      harness.runtime.pollServiceAuthClaim(ctx, {
        claimToken: registration.claim_token,
      }),
    );
    assert.ok("access_token" in token);
    await expect(
      withCtx(harness, (ctx) =>
        harness.runtime.exchangeIdentityAssertion(ctx, {
          assertion: token.identity_assertion ?? "",
          resource: "https://app.convex.nyc/",
        }),
      ),
    ).rejects.toThrow(/resource does not match/);
  });
});
