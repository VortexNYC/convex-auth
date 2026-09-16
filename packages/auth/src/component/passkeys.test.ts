/// <reference types="vite/client" />

import { describe, expect, it, beforeAll } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.*s");

const RP_NAME = "Test App";
const RP_ID = "test.example.com";
const ORIGIN = "https://test.example.com";

beforeAll(() => {
  process.env.CONVEX_SITE_URL = "https://test.convex.site";
  process.env.JWT_PRIVATE_KEY = JSON.stringify({
    kty: "RSA",
    n: "xGOr-H7rQ1dG3qZ5m8J_h8m7gW_lLpFQx9YlM4Y8J_l0hHn2xP_l7g",
    e: "AQAB",
    d: "xGOr-H7rQ1dG3qZ5m8J_h8m7gW_lLpFQx9YlM4Y8J_l0hHn2xP_l7g",
    p: "xGOr-H7rQ1dG3qZ5m8J_h8m7gW_lLpFQx9YlM4Y8J_l0hHn2xP_l7g",
    q: "xGOr-H7rQ1dG3qZ5m8J_h8m7gW_lLpFQx9YlM4Y8J_l0hHn2xP_l7g",
    dp: "xGOr-H7rQ1dG3qZ5m8J_h8m7gW_lLpFQx9YlM4Y8J_l0hHn2xP_l7g",
    dq: "xGOr-H7rQ1dG3qZ5m8J_h8m7gW_lLpFQx9YlM4Y8J_l0hHn2xP_l7g",
    qi: "xGOr-H7rQ1dG3qZ5m8J_h8m7gW_lLpFQx9YlM4Y8J_l0hHn2xP_l7g",
    kid: "test-key",
  });
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

  it("lists and revokes passkeys for a user", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t);

    const list = await t.query(api.passkeys.listPasskeys, { userId });
    expect(list).toHaveLength(0);

    const revoked = await t.mutation(api.passkeys.revokePasskey, {
      credentialId: "nonexistent",
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

    const revoked = await t.mutation(api.passkeys.revokePasskey, { credentialId });
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

    // Revoked passkeys don't count toward the cap.
    await t.run(async (ctx) => {
      const pk = await ctx.db
        .query("auth_passkeys")
        .withIndex("by_credentialId", (q) => q.eq("credentialId", "existing-credential"))
        .first();
      await ctx.db.patch(pk!._id, { revokedAt: 1 });
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

    // Victim's passkey exists; attacker generates options scoped to themselves.
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
});
