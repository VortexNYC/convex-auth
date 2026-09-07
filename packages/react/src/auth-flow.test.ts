import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  createConvexAuthEventCapture,
  createConvexAuthFlowStorage,
  createConvexAuthRoutePaths,
  getConvexPendingAuthFlowStorageKey,
  getConvexPendingPostSignUpStorageKey,
  getConvexPostSignUpFailureStorageKey,
  toSafeConvexRedirectPath,
  type ConvexAuthStorageLike,
} from "./auth-flow";

function createStorage(): ConvexAuthStorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("auth flow helpers", () => {
  it("builds default route paths with app overrides", () => {
    assert.deepEqual(createConvexAuthRoutePaths({ postSignInPath: "/dashboard" }), {
      signInPath: "/sign-in",
      signUpPath: "/sign-up",
      acceptInvitePath: "/accept-invite",
      postSignInPath: "/dashboard",
      postSignUpPath: "/post-sign-up",
      chooseOrganizationPath: "/onboarding/choose-organization",
    });
  });

  it("accepts same-origin relative and absolute redirect paths only", () => {
    assert.equal(toSafeConvexRedirectPath("/app?tab=1#x", "https://example.com"), "/app?tab=1#x");
    assert.equal(
      toSafeConvexRedirectPath("https://example.com/path?q=1#hash", "https://example.com"),
      "/path?q=1#hash",
    );
    assert.equal(toSafeConvexRedirectPath("//evil.test/path", "https://example.com"), undefined);
    assert.equal(
      toSafeConvexRedirectPath("https://evil.test/path", "https://example.com"),
      undefined,
    );
    assert.equal(toSafeConvexRedirectPath(undefined, "https://example.com"), undefined);
  });

  it("stores and consumes pending auth flow state once", () => {
    const storage = createStorage();
    const authFlow = createConvexAuthFlowStorage({
      storage,
      storageKeyPrefix: "app.auth",
      currentOrigin: "https://example.com",
    });

    authFlow.markPendingAuthFlow("sign-in", { redirectPath: "/app" });

    assert.equal(
      storage.getItem(
        getConvexPendingAuthFlowStorageKey({
          flow: "sign-in",
          storageKeyPrefix: "app.auth",
        }),
      ),
      JSON.stringify({ redirectPath: "/app" }),
    );
    assert.deepEqual(authFlow.consumePendingAuthFlow("sign-in"), {
      redirectPath: "/app",
    });
    assert.equal(authFlow.consumePendingAuthFlow("sign-in"), null);
  });

  it("returns empty object when pending auth flow payload is malformed", () => {
    const storage = createStorage();
    storage.setItem("app.auth.pending.sign-up", "not-json");
    const authFlow = createConvexAuthFlowStorage({
      storage,
      storageKeyPrefix: "app.auth",
    });

    assert.deepEqual(authFlow.consumePendingAuthFlow("sign-up"), {});
  });

  it("marks and clears pending post sign-up sync keys", () => {
    const storage = createStorage();
    const authFlow = createConvexAuthFlowStorage({
      storage,
      storageKeyPrefix: "app.auth",
    });

    authFlow.markPendingPostSignUpSync();
    assert.equal(storage.getItem(getConvexPendingPostSignUpStorageKey("app.auth")), "true");

    storage.setItem(getConvexPostSignUpFailureStorageKey("app.auth"), "invite-email-mismatch");
    authFlow.clearPendingPostSignUpSync();

    assert.equal(storage.getItem(getConvexPendingPostSignUpStorageKey("app.auth")), null);
    assert.equal(storage.getItem(getConvexPostSignUpFailureStorageKey("app.auth")), null);
  });

  it("wraps app event capture", () => {
    const events: Array<{ eventName: string; surface: string }> = [];
    const captureAuthEvent = createConvexAuthEventCapture((eventName, properties) => {
      events.push({ eventName, surface: properties.surface });
    });

    captureAuthEvent("auth_sign_in_opened", { surface: "sign-in" });

    assert.deepEqual(events, [{ eventName: "auth_sign_in_opened", surface: "sign-in" }]);
  });
});
