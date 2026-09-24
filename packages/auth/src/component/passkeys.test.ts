/// <reference types="vite/client" />

import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { generateKeyPair, exportJWK } from "jose";
import { convexTest } from "convex-test";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { isCounterRegressionError } from "./passkeys.js";

const { mockVerifyAuthenticationResponse } = vi.hoisted(() => ({
  mockVerifyAuthenticationResponse: vi.fn(),
}));

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...actual, verifyAuthenticationResponse: mockVerifyAuthenticationResponse };
});

const modules = import.meta.glob("./**/*.*s");

const RP_NAME = "Test App";
const RP_ID = "test.example.com";
const ORIGIN = "https://test.example.com";

beforeAll(async () => {
  process.env.CONVEX_SITE_URL = "https://test.convex.site";
  const pair = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(pair.privateKey);
  const publicJwk = await exportJWK(pair.publicKey);
  process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
  process.env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });
});

beforeEach(() => {
  /*
   * Default: ceremonies fail verification. Tests that exercise the
   * post-verification mint path override this with mockResolvedValue.
   */
  mockVerifyAuthenticationResponse.mockReset();
  mockVerifyAuthenticationResponse.mockResolvedValue({ verified: false });
});

async function insertUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "shlomo@example.com",
      name: "Shlomo",
      emailVerified: false,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
    }),
  );
}

describe("passkeys", () => {
  it("generates registration options and stores a challenge", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
      userId,
      identifier: "shlomo@example.com",
      displayName: "Shlomo",
      rpName: RP_NAME,
      rpID: RP_ID,
    })) as { challenge: string };

    expect(options.challenge).toBeDefined();
    expect(typeof options.challenge).toBe("string");

    const challenges = await t.run(async (ctx) =>
      ctx.db
        .query("auth_passkey_challenges")
        .withIndex("by_challenge", (q) => q.eq("challenge", options.challenge))
        .take(100),
    );
    expect(challenges).toHaveLength(1);
    expect(challenges[0]!.type).toBe("registration");
    expect(challenges[0]!.identifier).toBe("shlomo@example.com");
  });

  it("binds the challenge identifier to the server-side user record", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
      userId,
      identifier: "attacker-supplied@example.com",
      rpName: RP_NAME,
      rpID: RP_ID,
    })) as { challenge: string };

    const challenge = await t.run(async (ctx) =>
      ctx.db
        .query("auth_passkey_challenges")
        .withIndex("by_challenge", (q) => q.eq("challenge", options.challenge))
        .first(),
    );
    expect(challenge?.identifier).toBe("shlomo@example.com");
  });

  it("lists and revokes passkeys for a user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const list = await t.query(api.passkeys.listPasskeys, { userId });
    expect(list).toHaveLength(0);

    const revoked = await t.mutation(api.passkeys.revokePasskey, {
      credentialId: "nonexistent",
      userId,
    });
    expect(revoked).toBe(false);
  });

  it("generates authentication options and stores a challenge", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
    })) as { challenge: string; allowCredentials: Array<{ id: string }> };

    expect(options.challenge).toBeDefined();
    expect(options.allowCredentials).toHaveLength(0);

    const challenges = await t.run(async (ctx) =>
      ctx.db
        .query("auth_passkey_challenges")
        .withIndex("by_challenge", (q) => q.eq("challenge", options.challenge))
        .take(100),
    );
    expect(challenges).toHaveLength(1);
    expect(challenges[0]!.type).toBe("authentication");
  });

  it("rejects an invalid registration verification", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
      userId,
      identifier: "shlomo@example.com",
      rpName: RP_NAME,
      rpID: RP_ID,
    })) as { challenge: string };

    await expect(
      t.mutation(api.passkeys.verifyPasskeyRegistration, {
        userId,
        identifier: "shlomo@example.com",
        challenge: options.challenge,
        response: {
          id: "fake-credential",
          rawId: "fake-credential",
          response: {
            clientDataJSON: "fake",
            attestationObject: "fake",
          },
          type: "public-key",
        },
        rpID: RP_ID,
        origin: ORIGIN,
      }),
    ).rejects.toThrow();
  });

  it("rejects an invalid authentication verification", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
    })) as { challenge: string };

    await expect(
      t.mutation(api.passkeys.verifyPasskeyAuthentication, {
        challenge: options.challenge,
        response: {
          id: "fake-credential",
          rawId: "fake-credential",
          response: {
            clientDataJSON: "fake",
            authenticatorData: "fake",
            signature: "fake",
          },
          type: "public-key",
        },
        rpID: RP_ID,
        origin: ORIGIN,
      }),
    ).rejects.toThrow();
  });

  it("stores the passkey identity on the session row it mints", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();

    const identityDocId = await t.run(async (ctx) =>
      ctx.db.insert("auth_identities", {
        identityId: "passkey:rp:cred-1",
        userId,
        provider: "passkey",
        issuer: "native",
        subject: "cred-1",
        tokenIdentifier: "passkey:rp:cred-1",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        identityId: identityDocId,
        credentialId: "cred-1",
        publicKey: "cHVibGljLWtleQ",
        counter: 0,
        transports: [],
        aaguid: "00000000-0000-0000-0000-000000000000",
        deviceType: "singleDevice",
        backedUp: false,
        name: "Test key",
        createdAt: now,
        lastUsedAt: now,
      }),
    );

    const options = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
    })) as { challenge: string };

    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 1,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        userVerified: true,
      },
    });

    await t.mutation(api.passkeys.verifyPasskeyAuthentication, {
      challenge: options.challenge,
      response: {
        id: "cred-1",
        rawId: "cred-1",
        response: {
          clientDataJSON: "fake",
          authenticatorData: "fake",
          signature: "fake",
        },
        type: "public-key",
      },
      rpID: RP_ID,
      origin: ORIGIN,
    });

    const session = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    );
    expect(session?.identityId).toBe(identityDocId);
    expect(session?.credentialId).toBe("cred-1");
  });

  it("returns an empty list when no userId is provided", async () => {
    const t = convexTest(schema, modules);
    const list = await t.query(api.passkeys.listPasskeys, {});
    expect(list).toHaveLength(0);
  });

  it("revokes an existing passkey", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const credentialId = "credential-to-revoke";
    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        identityId: undefined,
        credentialId,
        publicKey: "fake-public-key",
        counter: 0,
        transports: [],
        aaguid: "00000000-0000-0000-0000-000000000000",
        deviceType: "singleDevice",
        backedUp: false,
        name: "Test key",
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );

    const listBefore = await t.query(api.passkeys.listPasskeys, { userId });
    expect(listBefore).toHaveLength(1);
    expect(listBefore[0]!.revoked).toBe(false);

    const revoked = await t.mutation(api.passkeys.revokePasskey, { credentialId, userId });
    expect(revoked).toBe(true);

    const listAfter = await t.query(api.passkeys.listPasskeys, { userId });
    expect(listAfter[0]!.revoked).toBe(true);

    const events = await t.run(async (ctx) =>
      ctx.db
        .query("auth_audit_events")
        .withIndex("by_event_type", (q) => q.eq("eventType", "passkey_revoked"))
        .take(10),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.targetId).toBe(credentialId);
  });

  it("renames a passkey and rejects wrong-owner and empty names", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "other@example.com",
        name: "Other",
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    const credentialId = "credential-to-rename";
    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        credentialId,
        publicKey: "fake-public-key",
        counter: 0,
        transports: [],
        name: "Old name",
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );

    await expect(
      t.mutation(api.passkeys.renamePasskey, {
        credentialId,
        userId: otherUserId,
        name: "Hijack",
      }),
    ).rejects.toThrow("does not belong");

    await expect(
      t.mutation(api.passkeys.renamePasskey, { credentialId, userId, name: "   " }),
    ).rejects.toThrow("cannot be empty");

    const renamed = await t.mutation(api.passkeys.renamePasskey, {
      credentialId,
      userId,
      name: "  Work laptop  ",
    });
    expect(renamed).toBe(true);

    const list = await t.query(api.passkeys.listPasskeys, { userId });
    expect(list[0]!.name).toBe("Work laptop");
  });

  it("refuses to revoke a passkey owned by another user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "other@example.com",
        name: "Other",
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "victims-credential",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );

    await expect(
      t.mutation(api.passkeys.revokePasskey, {
        credentialId: "victims-credential",
        userId: otherUserId,
      }),
    ).rejects.toThrow("does not belong");

    const list = await t.query(api.passkeys.listPasskeys, { userId });
    expect(list[0]!.revoked).toBe(false);
  });

  it("enforces the per-user passkey limit", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "existing-credential",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );

    await expect(
      t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
        userId,
        identifier: "shlomo@example.com",
        rpName: RP_NAME,
        rpID: RP_ID,
        maxPasskeys: 1,
      }),
    ).rejects.toThrow("Maximum number of passkeys");

    /* Revoked passkeys don't count toward the cap. */
    await t.run(async (ctx) => {
      const pk = await ctx.db
        .query("auth_passkeys")
        .withIndex("by_credentialId", (q) => q.eq("credentialId", "existing-credential"))
        .first();
      await ctx.db.patch("auth_passkeys", pk!._id, { revokedAt: 1 });
    });

    const options = await t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
      userId,
      identifier: "shlomo@example.com",
      rpName: RP_NAME,
      rpID: RP_ID,
      maxPasskeys: 1,
    });
    expect(options).toBeDefined();
  });

  it("rejects an authentication ceremony when the challenge was scoped to another user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const victimId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "victim@example.com",
        name: "Victim",
        emailVerified: false,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
      }),
    );

    /* Victim's passkey exists; attacker generates options scoped to themselves. */
    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId: victimId,
        credentialId: "victim-credential",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );
    const options = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
    })) as { challenge: string };

    await expect(
      t.mutation(api.passkeys.verifyPasskeyAuthentication, {
        challenge: options.challenge,
        response: {
          id: "victim-credential",
          rawId: "victim-credential",
          response: {
            clientDataJSON: "fake",
            authenticatorData: "fake",
            signature: "fake",
          },
          type: "public-key",
        },
        rpID: RP_ID,
        origin: ORIGIN,
      }),
    ).rejects.toThrow("does not match the user");
  });

  it("detects SimpleWebAuthn counter-regression errors", () => {
    expect(
      isCounterRegressionError(new Error("Response counter value 4 was lower than expected 9")),
    ).toBe(true);
    expect(isCounterRegressionError(new Error("Unexpected origin"))).toBe(false);
    expect(isCounterRegressionError("not an error")).toBe(false);
    expect(isCounterRegressionError(null)).toBe(false);
  });

  it("keeps the authentication challenge alive when verification fails", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "cred-1",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );

    const options = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
    })) as { challenge: string };

    await expect(
      t.mutation(api.passkeys.verifyPasskeyAuthentication, {
        challenge: options.challenge,
        response: {
          id: "cred-1",
          rawId: "cred-1",
          response: {
            clientDataJSON: "fake",
            authenticatorData: "fake",
            signature: "fake",
          },
          type: "public-key",
        },
        rpID: RP_ID,
        origin: ORIGIN,
      }),
    ).rejects.toThrow();

    /* The challenge was not burned — the user can retry the ceremony. */
    const challenges = await t.run(async (ctx) =>
      ctx.db
        .query("auth_passkey_challenges")
        .withIndex("by_challenge", (q) => q.eq("challenge", options.challenge))
        .take(10),
    );
    expect(challenges).toHaveLength(1);
  });

  it("ignores a caller-supplied identifier that differs from the challenge-bound one", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
      userId,
      identifier: "shlomo@example.com",
      rpName: RP_NAME,
      rpID: RP_ID,
    })) as { challenge: string };

    const err = await t
      .mutation(api.passkeys.verifyPasskeyRegistration, {
        userId,
        identifier: "attacker@example.com",
        challenge: options.challenge,
        response: {
          id: "fake-credential",
          rawId: "fake-credential",
          response: { clientDataJSON: "fake", attestationObject: "fake" },
          type: "public-key",
        },
        rpID: RP_ID,
        origin: ORIGIN,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("identifier");
  });

  it("does not enumerate a user's credentials unless explicitly authorized", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "victim-credential",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );

    const unscoped = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
    })) as { allowCredentials: Array<{ id: string }> };
    expect(unscoped.allowCredentials).toHaveLength(0);

    const authorized = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
      enumerateCredentials: true,
    })) as { allowCredentials: Array<{ id: string }> };
    expect(authorized.allowCredentials).toHaveLength(1);
    expect(authorized.allowCredentials[0]!.id).toBe("victim-credential");
  });

  it("revoking a passkey revokes the sessions and refresh tokens it minted", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "cred-with-session",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      });
      await ctx.db.insert("authSessions", {
        sessionId: "sess-passkey",
        userId,
        token: "jwt",
        familyId: "fam-1",
        expiresAt: now + 60_000,
        credentialId: "cred-with-session",
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("authSessions", {
        sessionId: "sess-password",
        userId,
        token: "jwt2",
        familyId: "fam-2",
        expiresAt: now + 60_000,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-1",
        sessionId: "sess-passkey",
        userId,
        familyId: "fam-1",
        expiresAt: now + 60_000,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("authRefreshTokens", {
        tokenHash: "hash-2",
        sessionId: "sess-password",
        userId,
        familyId: "fam-2",
        expiresAt: now + 60_000,
        createdAt: 0,
        updatedAt: 0,
      });
    });

    const revoked = await t.mutation(api.passkeys.revokePasskey, {
      credentialId: "cred-with-session",
      userId,
    });
    expect(revoked).toBe(true);

    const sessions = await t.run(async (ctx) =>
      ctx.db
        .query("authSessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(10),
    );
    const refreshTokens = await t.run(async (ctx) =>
      ctx.db
        .query("authRefreshTokens")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(10),
    );

    const passkeySession = sessions.find((s) => s.sessionId === "sess-passkey");
    const passwordSession = sessions.find((s) => s.sessionId === "sess-password");
    expect(passkeySession?.revokedAt).toBeDefined();
    expect(passwordSession?.revokedAt).toBeUndefined();

    const passkeyRefresh = refreshTokens.find((r) => r.familyId === "fam-1");
    const passwordRefresh = refreshTokens.find((r) => r.familyId === "fam-2");
    expect(passkeyRefresh?.revokedAt).toBeDefined();
    expect(passwordRefresh?.revokedAt).toBeUndefined();
  });

  it("consumes in-flight two-factor challenges tied to the revoked passkey", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      const identityId = await ctx.db.insert("auth_identities", {
        identityId: "passkey:test.example.com:cred-pending",
        userId,
        provider: "passkey",
        issuer: "test.example.com",
        subject: "cred-pending",
        tokenIdentifier: "cred-pending",
        email: "shlomo@example.com",
        emailVerified: false,
        sessionId: null,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("auth_passkeys", {
        userId,
        identityId,
        credentialId: "cred-pending",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      });
      await ctx.db.insert("authVerificationCodes", {
        userId,
        type: "two_factor_pending",
        tokenHash: "pending-passkey",
        identityId,
        credentialId: "cred-pending",
        expiresAt: now + 60_000,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.insert("authVerificationCodes", {
        userId,
        type: "two_factor_pending",
        tokenHash: "pending-password",
        identityId: "identity_other",
        expiresAt: now + 60_000,
        createdAt: 0,
        updatedAt: 0,
      });
    });

    await t.mutation(api.passkeys.revokePasskey, { credentialId: "cred-pending", userId });

    const codes = await t.run(async (ctx) =>
      ctx.db
        .query("authVerificationCodes")
        .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", "two_factor_pending"))
        .take(10),
    );
    expect(codes.find((c) => c.tokenHash === "pending-passkey")?.consumedAt).toBeDefined();
    expect(codes.find((c) => c.tokenHash === "pending-password")?.consumedAt).toBeUndefined();
  });

  it("revokes every family member even beyond a single page of results", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();
    const familySize = 1005;

    await t.run(async (ctx) => {
      await ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "cred-big-family",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      });
      await ctx.db.insert("authSessions", {
        sessionId: "sess-big-family",
        userId,
        token: "jwt",
        familyId: "fam-big",
        expiresAt: now + 60_000,
        credentialId: "cred-big-family",
        createdAt: 0,
        updatedAt: 0,
      });
      for (let i = 0; i < familySize; i++) {
        await ctx.db.insert("authRefreshTokens", {
          tokenHash: `hash-big-${i}`,
          sessionId: `sess-big-${i}`,
          userId,
          familyId: "fam-big",
          expiresAt: now + 60_000,
          createdAt: 0,
          updatedAt: 0,
        });
      }
    });

    const revoked = await t.mutation(api.passkeys.revokePasskey, {
      credentialId: "cred-big-family",
      userId,
    });
    expect(revoked).toBe(true);

    const activeTokens = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("authRefreshTokens")
          .withIndex("by_family", (q) => q.eq("familyId", "fam-big"))
          .take(familySize + 10)
      ).filter((r) => r.revokedAt === undefined),
    );
    expect(activeTokens).toHaveLength(0);
  });

  it("counts only active passkeys toward the cap even when revoked rows outnumber them", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("auth_passkeys", {
          userId,
          credentialId: `revoked-${i}`,
          publicKey: "fake",
          counter: 0,
          revokedAt: 1,
          createdAt: 0,
          lastUsedAt: 0,
        });
      }
      await ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "active-credential",
        publicKey: "fake",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      });
    });

    await expect(
      t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
        userId,
        identifier: "shlomo@example.com",
        rpName: RP_NAME,
        rpID: RP_ID,
        maxPasskeys: 1,
      }),
    ).rejects.toThrow("Maximum number of passkeys");
  });

  it("garbage-collects expired challenges when generating options", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);
    const now = Date.now();

    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkey_challenges", {
        challenge: "stale-challenge",
        type: "authentication",
        userId,
        expiresAt: now - 1000,
        createdAt: now - 10_000,
      }),
    );

    await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
    });

    const stale = await t.run(async (ctx) =>
      ctx.db
        .query("auth_passkey_challenges")
        .withIndex("by_challenge", (q) => q.eq("challenge", "stale-challenge"))
        .first(),
    );
    expect(stale).toBeNull();
  });

  it("binds rpID and origin to the challenge record at creation", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyAuthenticationOptions, {
      userId,
      rpID: RP_ID,
      origin: [ORIGIN, "https://other.example.com"],
    })) as { challenge: string };

    const challenge = await t.run(async (ctx) =>
      ctx.db
        .query("auth_passkey_challenges")
        .withIndex("by_challenge", (q) => q.eq("challenge", options.challenge))
        .first(),
    );
    expect(challenge?.rpID).toBe(RP_ID);
    expect(challenge?.origin).toEqual([ORIGIN, "https://other.example.com"]);
  });

  it("re-checks the per-user cap at verify time, not only at options time", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const options = (await t.mutation(api.passkeys.generatePasskeyRegistrationOptions, {
      userId,
      identifier: "shlomo@example.com",
      rpName: RP_NAME,
      rpID: RP_ID,
      maxPasskeys: 1,
    })) as { challenge: string };

    /* Another ceremony lands a passkey before this one verifies. */
    await t.run(async (ctx) =>
      ctx.db.insert("auth_passkeys", {
        userId,
        credentialId: "parallel-credential",
        publicKey: "fake-public-key",
        counter: 0,
        createdAt: 0,
        lastUsedAt: 0,
      }),
    );

    await expect(
      t.mutation(api.passkeys.verifyPasskeyRegistration, {
        userId,
        identifier: "shlomo@example.com",
        challenge: options.challenge,
        response: {
          id: "new-credential",
          rawId: "new-credential",
          response: { clientDataJSON: "fake", attestationObject: "fake" },
          type: "public-key",
        },
        rpID: RP_ID,
        origin: ORIGIN,
        maxPasskeys: 1,
      }),
    ).rejects.toThrow("Maximum number of passkeys");
  });
});
