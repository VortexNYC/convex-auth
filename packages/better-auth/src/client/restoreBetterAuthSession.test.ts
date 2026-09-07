/**
 * Coverage for `restoreBetterAuthSession` — the entry point consumers
 * call after page reload to rebuild the auth context from a serialized
 * snapshot (cookies / sessionStorage / hidden HTML input).
 *
 * Composes `createBetterAuthBridgeState` + `normalizeBetterAuthIdentity`,
 * so this test asserts the wiring is right (identity normalization
 * happens iff identity is non-null, runtime status is consistent).
 */
import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { restoreBetterAuthSession } from "./restoreBetterAuthSession";

const providerAuthed = {
  isAuthenticated: true,
  isLoading: false,
  hasToken: true,
};

describe("restoreBetterAuthSession", () => {
  it("identity=null pass-through (no normalization)", () => {
    const result = restoreBetterAuthSession({
      identity: null,
      providerState: providerAuthed,
      convexAuthenticated: true,
    });
    assert.equal(result.identity, null);
  });

  it("identity present → normalized into NormalizedAuthIdentity shape", () => {
    const result = restoreBetterAuthSession({
      identity: {
        subject: "u_1",
        issuer: "https://example.com",
        email: "shlomo@example.com",
        emailVerified: true,
      },
      providerState: providerAuthed,
      convexAuthenticated: true,
    });
    assert.ok(result.identity !== null);
    assert.equal(result.identity.subject, "u_1");
    assert.equal(result.identity.issuer, "https://example.com");
    assert.equal(result.identity.email, "shlomo@example.com");
    assert.equal(result.identity.emailVerified, true);
    // tokenIdentifier composes subject + issuer.
    assert.match(result.identity.tokenIdentifier, /example\.com/);
    assert.match(result.identity.tokenIdentifier, /u_1/);
    // provider stamp is the canonical Better-Auth key.
    assert.equal(result.identity.provider, "better-auth");
  });

  it("defaults emailVerified=false + email=null + name=null when omitted", () => {
    const result = restoreBetterAuthSession({
      identity: {
        subject: "u_1",
        issuer: "https://example.com",
      },
      providerState: providerAuthed,
      convexAuthenticated: true,
    });
    assert.ok(result.identity !== null);
    assert.equal(result.identity.email, null);
    assert.equal(result.identity.emailVerified, false);
    assert.equal(result.identity.name, null);
  });

  it("providerState passes through verbatim", () => {
    const result = restoreBetterAuthSession({
      identity: null,
      providerState: providerAuthed,
      convexAuthenticated: true,
    });
    assert.equal(result.providerState, providerAuthed);
  });

  it("runtimeStatus.state === 'convexReady' when fully authed", () => {
    const result = restoreBetterAuthSession({
      identity: null,
      providerState: providerAuthed,
      convexAuthenticated: true,
    });
    assert.equal(result.runtimeStatus.state, "convexReady");
  });

  it("terminalFailure pass-through → reauthRequired=true", () => {
    const result = restoreBetterAuthSession({
      identity: null,
      providerState: providerAuthed,
      convexAuthenticated: true,
      terminalFailure: true,
    });
    assert.equal(result.runtimeStatus.reauthRequired, true);
  });
});
