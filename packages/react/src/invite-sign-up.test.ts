import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildInviteSignUpUrl,
  getAfterSignUpPath,
  getInvitationToken,
  prepareInviteAcceptRedirect,
} from "./invite-sign-up";

describe("invite sign-up helpers", () => {
  it("reads invitation token from supported query param names", () => {
    assert.equal(getInvitationToken(new URLSearchParams("invitation_token=abc")), "abc");
    assert.equal(getInvitationToken(new URLSearchParams("token=abc")), "abc");
    assert.equal(getInvitationToken(new URLSearchParams("foo=bar")), null);
  });

  it("uses only safe after-sign-up paths", () => {
    assert.equal(getAfterSignUpPath("?redirect_url=/app", "/post-sign-up"), "/app");
    assert.equal(
      getAfterSignUpPath(
        "?redirect_url=https://app.convex.test/post-sign-up?invitation_token=invite_123",
        "/post-sign-up",
        "https://app.convex.test",
      ),
      "/post-sign-up?invitation_token=invite_123",
    );
    assert.equal(
      getAfterSignUpPath(
        "?redirect_url=https://evil.com",
        "/post-sign-up",
        "https://app.convex.test",
      ),
      "/post-sign-up",
    );
  });

  it("builds invite sign-up URL with token, email, and redirect", () => {
    const url = buildInviteSignUpUrl({
      baseSignUpUrl: "https://app.convex.test/sign-up",
      fallbackSignUpPath: "/sign-up",
      currentOrigin: "https://app.convex.test",
      currentSearch: "?token=invite_123&email=USER@Example.COM",
      afterSignUpPath: "/post-sign-up?invitation_token=invite_123",
      emailAddress: null,
    });

    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/sign-up");
    assert.equal(parsed.searchParams.get("invitation_token"), "invite_123");
    assert.equal(parsed.searchParams.get("email_address"), "USER@Example.COM");
    assert.equal(parsed.searchParams.get("identifier"), "USER@Example.COM");
    assert.equal(
      parsed.searchParams.get("redirect_url"),
      "https://app.convex.test/post-sign-up?invitation_token=invite_123",
    );
  });

  it("prepares invite accept redirect with resolved email and safe path", async () => {
    const result = await prepareInviteAcceptRedirect({
      baseSignUpUrl: "https://app.convex.test/sign-up",
      fallbackSignUpPath: "/sign-up",
      currentOrigin: "https://app.convex.test",
      currentSearch: "?token=invite_123",
      afterSignUpPath: "/post-sign-up?invitation_token=invite_123",
      getInvitationEmail: async (invitationToken) =>
        invitationToken === "invite_123" ? "invited@example.com" : null,
      toSafeRedirectPath: (url) => new URL(url).pathname,
    });

    assert.equal(result.isRedirectable, true);
    if (!result.isRedirectable) {
      throw new Error("expected redirectable invite");
    }

    const parsed = new URL(result.signUpUrl);
    assert.equal(result.invitationToken, "invite_123");
    assert.equal(result.redirectPath, "/sign-up");
    assert.equal(parsed.searchParams.get("email_address"), "invited@example.com");
    assert.equal(
      parsed.searchParams.get("redirect_url"),
      "https://app.convex.test/post-sign-up?invitation_token=invite_123",
    );
  });

  it("does not prepare invite accept redirect without a token", async () => {
    const result = await prepareInviteAcceptRedirect({
      fallbackSignUpPath: "/sign-up",
      currentOrigin: "https://app.convex.test",
      currentSearch: "?email=invited@example.com",
      afterSignUpPath: "/post-sign-up",
    });

    assert.equal(result.isRedirectable, false);
    if (result.isRedirectable) {
      throw new Error("expected missing invite token");
    }
    assert.equal(result.reason, "missing_ticket");
  });

  it("does not prepare invite accept redirect when invite lookup fails", async () => {
    const result = await prepareInviteAcceptRedirect({
      fallbackSignUpPath: "/sign-up",
      currentOrigin: "https://app.convex.test",
      currentSearch: "?token=invite_123&email=invited@example.com",
      afterSignUpPath: "/post-sign-up",
      getInvitationEmail: async () => null,
    });

    assert.equal(result.isRedirectable, false);
    if (result.isRedirectable) {
      throw new Error("expected unavailable invite");
    }
    assert.equal(result.reason, "invitation_unavailable");
  });
});
