/// <reference types="vite/client" />

import { beforeAll, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { componentsGeneric } from "convex/server";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import rateLimiterTest from "@convex-dev/rate-limiter/test";

import convexAuthTest from "../../test.js";
import { convexAuth } from "./convexAuth.js";
import { hashToken } from "./tokens.js";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";

/* Unlike oneTap.test.ts — which mocks runQuery/runMutation — this file runs
 * signInOneTap's handler through a real convex-test action ctx wired to the
 * registered convexAuth component (and its rateLimiter/batchWorker children).
 * Real component-side arg/return validators, real indexes, real row writes,
 * and the real rate-limiter child component. One caveat vs. a deployed
 * boundary: t.action's inline path skips the action's own args/returns
 * validators (the component refs it calls are still fully validated). Only
 * the Google JWKS endpoint and the test keypair stand in for Google. */

const component = (componentsGeneric() as unknown as { convexAuth: unknown })
  .convexAuth as NativeEmailAndPasswordComponentHandle;

const GOOGLE_CLIENT_ID = "google-client-id";

async function mintGoogleIdToken(payload: Record<string, unknown> = {}) {
  const privateJwk = JSON.parse(process.env.JWT_PRIVATE_KEY!);
  const privateKey = await importJWK(privateJwk, "RS256");
  return await new SignJWT({
    sub: "google-12345",
    name: "Google User",
    email: "Google@Example.com",
    email_verified: true,
    picture: "https://google-avatar",
    iss: "https://accounts.google.com",
    aud: GOOGLE_CLIENT_ID,
    ...payload,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function createJwksFetch() {
  let calls = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://www.googleapis.com/oauth2/v3/certs") {
      calls += 1;
      return new Response(process.env.JWKS!, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

function exec(registered: unknown) {
  const handler = Reflect.get(registered as object, "_handler");
  return {
    handler: async (ctx: unknown, args: unknown): Promise<unknown> =>
      await Reflect.apply(handler as (...a: unknown[]) => unknown, registered, [ctx, args]),
  };
}

function makeConvex() {
  /* Empty root app: no functions or tables of its own — every call resolves
   * into the registered convexAuth component. The dummy _generated entry
   * anchors findModulesRoot (same pattern as public-test-entry.vitest.ts)
   * and avoids the default import.meta.glob, which isn't transformed inside
   * the compiled dist. */
  const t = convexTest({
    modules: { "./convex/_generated/api.ts": () => Promise.resolve({}) },
  });
  convexAuthTest.register(t);
  rateLimiterTest.register(t as never, "convexAuth/rateLimiter");
  return t;
}

type OneTapOverrides = {
  clientId?: string;
  hd?: string;
  maxTokenAge?: number;
  fetchImpl?: typeof fetch;
  disableSignUp?: boolean;
  disableImplicitSignUp?: boolean;
  requireEmailVerification?: boolean;
  accountLinking?: {
    enabled?: boolean;
    requiresEmailVerification?: boolean;
    disableImplicitLinking?: boolean;
  };
  trustedProviders?: string[];
  rateLimit?: { windowMs?: number; maxAttempts?: number } | false;
};

/* Goes through the real convexAuth() factory — not nativeOneTap directly —
 * so oauth.google inheritance and config normalization are covered too. */
function makeAuth(fetchImpl: typeof fetch, oneTap: OneTapOverrides = {}) {
  const auth = convexAuth({
    component,
    oneTap: { clientId: GOOGLE_CLIENT_ID, fetchImpl, ...oneTap },
  });
  return {
    signIn: exec(auth.signInOneTap).handler,
    verifySession: exec(auth.verifySession).handler,
  };
}

type SignInResult = {
  token: string | null;
  refreshToken: string;
  sessionId: string;
  user: Record<string, unknown>;
  userId: string;
  identityId: string;
  createdUser: boolean;
};

async function componentTable(t: ReturnType<typeof makeConvex>, table: string) {
  return (await t.runInComponent("convexAuth", async (ctx) => {
    return await (ctx.db.query as (name: string) => { collect(): Promise<unknown[]> })(
      table,
    ).collect();
  })) as Record<string, unknown>[];
}

describe("signInOneTap through the real component", () => {
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    const privateJwk = await exportJWK(pair.privateKey);
    const publicJwk = await exportJWK(pair.publicKey);
    process.env.JWT_PRIVATE_KEY = JSON.stringify(privateJwk);
    process.env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });
    process.env.CONVEX_SITE_URL = "https://test.convex.site";
  });

  it("persists a real user, google identity, account, session, and refresh-token hash", async () => {
    const t = makeConvex();
    const { fetchImpl, calls } = createJwksFetch();
    const auth = makeAuth(fetchImpl);
    const idToken = await mintGoogleIdToken();

    const result = (await t.action(
      async (ctx) => await auth.signIn(ctx, { idToken }),
    )) as SignInResult;

    expect(result.userId).toBeTruthy();
    expect(result.token).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
    expect(result.createdUser).toBe(true);
    /* JWKS fetched exactly once for the first verification. */
    expect(calls()).toBe(1);

    const users = await componentTable(t, "users");
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("google@example.com");
    expect(users[0].emailVerified).toBe(true);

    const identities = await componentTable(t, "auth_identities");
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-12345",
      identityId: "https://accounts.google.com:google-12345",
      tokenIdentifier: "https://accounts.google.com:google-12345",
      emailVerified: true,
      userId: result.userId,
    });

    const accounts = await componentTable(t, "authAccounts");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      provider: "google",
      subject: "google-12345",
      userId: result.userId,
    });

    const sessions = await componentTable(t, "authSessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sessionId: result.sessionId, userId: result.userId });

    const refreshTokens = await componentTable(t, "authRefreshTokens");
    expect(refreshTokens).toHaveLength(1);
    expect(refreshTokens[0].sessionId).toBe(result.sessionId);
    /* Stored value must be exactly the hash of the returned refresh token —
     * never the token itself. */
    expect(refreshTokens[0].tokenHash).toBe(await hashToken(result.refreshToken));
  });

  it("verifySession accepts the minted token against the persisted session row", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = makeAuth(fetchImpl);
    const idToken = await mintGoogleIdToken();

    const result = (await t.action(
      async (ctx) => await auth.signIn(ctx, { idToken }),
    )) as SignInResult;

    const verified = (await t.query(
      async (ctx) => await auth.verifySession(ctx, { token: result.token }),
    )) as { user?: Record<string, unknown>; sessionId?: string };

    expect(verified.user?.email).toBe("google@example.com");
    expect(verified.sessionId).toBe(result.sessionId);
  });

  it("repeat sign-in resolves the same user, mints a second session, and hits the JWKS cache", async () => {
    const t = makeConvex();
    const { fetchImpl, calls } = createJwksFetch();
    const auth = makeAuth(fetchImpl);
    const idToken = await mintGoogleIdToken();

    const first = (await t.action(
      async (ctx) => await auth.signIn(ctx, { idToken }),
    )) as SignInResult;
    const second = (await t.action(
      async (ctx) => await auth.signIn(ctx, { idToken }),
    )) as SignInResult;

    expect(second.userId).toBe(first.userId);
    expect(second.createdUser).toBe(false);
    expect(second.sessionId).not.toBe(first.sessionId);
    /* Regression coverage for the initialSession early-return fix — the
     * existing-identity path must still mint a session. */
    expect(second.token).toBeTruthy();
    expect(second.refreshToken).toBeTruthy();
    /* Second verification was served from the 5-minute JWKS cache. */
    expect(calls()).toBe(1);

    const sessions = await componentTable(t, "authSessions");
    expect(sessions).toHaveLength(2);
  });

  it("resolves the same account as the redirect-OAuth provisioning path", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = makeAuth(fetchImpl);

    /* Seed exactly the way the redirect callback does — the same
     * provisionFromIdentity mutation with the same google identity key. */
    const seeded = (await t.mutation(component.identity.provisionFromIdentity, {
      identity: {
        identityId: "https://accounts.google.com:google-777",
        provider: "google",
        issuer: "https://accounts.google.com",
        subject: "google-777",
        tokenIdentifier: "https://accounts.google.com:google-777",
        email: "shared@example.com",
        emailVerified: true,
        sessionId: null,
      },
      user: { email: "shared@example.com", emailVerified: true, name: "Shared" },
    })) as { userId: string };

    const idToken = await mintGoogleIdToken({
      sub: "google-777",
      email: "shared@example.com",
    });
    const result = (await t.action(
      async (ctx) => await auth.signIn(ctx, { idToken }),
    )) as SignInResult;

    expect(result.userId).toBe(seeded.userId);
    expect(result.createdUser).toBe(false);

    const users = await componentTable(t, "users");
    expect(users).toHaveLength(1);
    const identities = await componentTable(t, "auth_identities");
    expect(identities).toHaveLength(1);
    /* The seeded identity resolves the user; provisioning creates no second
     * identity, and createAccount fills in the missing google account row —
     * exactly what a real redirect-callback-seeded deployment looks like
     * before the user's first One Tap sign-in. */
    const accounts = await componentTable(t, "authAccounts");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      provider: "google",
      subject: "google-777",
      userId: seeded.userId,
    });
  });

  it("oneTap: true inherits clientId and fetchImpl from oauth.google", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = convexAuth({
      component,
      oauth: { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: "", fetchImpl } },
      oneTap: true,
    });
    const idToken = await mintGoogleIdToken();

    const result = (await t.action(
      async (ctx) => await exec(auth.signInOneTap).handler(ctx, { idToken }),
    )) as SignInResult;

    expect(result.userId).toBeTruthy();
    expect(result.createdUser).toBe(true);
  });

  it("rejects a token minted for a different audience and persists nothing", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = makeAuth(fetchImpl);
    const idToken = await mintGoogleIdToken({ aud: "not-our-client" });

    await expect(t.action(async (ctx) => await auth.signIn(ctx, { idToken }))).rejects.toThrow(
      "INVALID_ID_TOKEN",
    );

    expect(await componentTable(t, "users")).toHaveLength(0);
    expect(await componentTable(t, "auth_identities")).toHaveLength(0);
  });

  it("rejects a nonce mismatch after signature verification", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = makeAuth(fetchImpl);
    const idToken = await mintGoogleIdToken({ nonce: "server-nonce" });

    await expect(
      t.action(async (ctx) => await auth.signIn(ctx, { idToken, nonce: "wrong-nonce" })),
    ).rejects.toThrow("INVALID_ID_TOKEN");

    expect(await componentTable(t, "users")).toHaveLength(0);
  });

  it("blocks new-user sign-in when disableSignUp is set", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = makeAuth(fetchImpl, { disableSignUp: true });
    const idToken = await mintGoogleIdToken();

    await expect(t.action(async (ctx) => await auth.signIn(ctx, { idToken }))).rejects.toThrow(
      "SIGN_UP_DISABLED",
    );

    expect(await componentTable(t, "users")).toHaveLength(0);
  });

  it("enforces accountLinking.enabled:false on a real email collision", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = makeAuth(fetchImpl, { accountLinking: { enabled: false } });

    /* Existing user owning the email, via the real provisioning path. */
    await t.mutation(component.identity.provisionFromIdentity, {
      identity: {
        identityId: "native:password-user",
        provider: "password",
        issuer: "native",
        subject: "password-user",
        tokenIdentifier: "native:password-user",
        email: "collision@example.com",
        emailVerified: true,
        sessionId: null,
      },
      user: { email: "collision@example.com", emailVerified: true, name: "Existing" },
    });

    const idToken = await mintGoogleIdToken({ email: "collision@example.com" });
    await expect(t.action(async (ctx) => await auth.signIn(ctx, { idToken }))).rejects.toThrow(
      "ACCOUNT_NOT_LINKED",
    );

    const users = await componentTable(t, "users");
    expect(users).toHaveLength(1);
    expect(await componentTable(t, "auth_identities")).toHaveLength(1);
    expect(await componentTable(t, "authSessions")).toHaveLength(0);
  });

  it("rate-limits replays through the real rateLimiter component", async () => {
    const t = makeConvex();
    const { fetchImpl } = createJwksFetch();
    const auth = makeAuth(fetchImpl, { rateLimit: { maxAttempts: 2, windowMs: 60_000 } });
    const idToken = await mintGoogleIdToken();

    await t.action(async (ctx) => await auth.signIn(ctx, { idToken }));
    await t.action(async (ctx) => await auth.signIn(ctx, { idToken }));
    await expect(t.action(async (ctx) => await auth.signIn(ctx, { idToken }))).rejects.toThrow(
      "Too many requests",
    );

    const users = await componentTable(t, "users");
    expect(users).toHaveLength(1);
  });
});
