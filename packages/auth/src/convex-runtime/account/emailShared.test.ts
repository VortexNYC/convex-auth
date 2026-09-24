/**
 * Coverage for `account/emailShared.ts` — pure helpers used by both
 * password-reset + email-verification flows:
 *
 *   - mapResendAccountEmailDelivery: Resend event → canonical delivery status
 *   - buildTokenUrl                : template > appOrigin > null
 *   - appendToken                  : query-string append
 *   - trimTrailingSlash            : trailing-slash strip
 *   - escapeHtml                   : injection-safe HTML escape
 *
 * Every helper here is a pure function, so this is a deterministic
 * contract test.
 */
import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  appendToken,
  buildTokenUrl,
  escapeHtml,
  mapResendAccountEmailDelivery,
  trimTrailingSlash,
} from "./emailShared";

describe("mapResendAccountEmailDelivery", () => {
  it("email.sent → sent", () => {
    assert.deepEqual(mapResendAccountEmailDelivery({ event: { type: "email.sent" } }), {
      status: "sent",
      eventType: "email.sent",
    });
  });

  it("email.delivered → delivered", () => {
    assert.deepEqual(mapResendAccountEmailDelivery({ event: { type: "email.delivered" } }), {
      status: "delivered",
      eventType: "email.delivered",
    });
  });

  it("email.opened + email.clicked + email.complained also map to delivered", () => {
    for (const type of ["email.opened", "email.clicked", "email.complained"] as const) {
      const result = mapResendAccountEmailDelivery({ event: { type } });
      assert.equal(result.status, "delivered");
      assert.equal(result.eventType, type);
    }
  });

  it("email.delivery_delayed → delivery_delayed", () => {
    assert.deepEqual(
      mapResendAccountEmailDelivery({
        event: { type: "email.delivery_delayed" },
      }),
      { status: "delivery_delayed", eventType: "email.delivery_delayed" },
    );
  });

  it("email.bounced → bounced + error from bounce message", () => {
    const result = mapResendAccountEmailDelivery({
      event: {
        type: "email.bounced",
        data: { bounce: { message: "Mailbox full" } },
      },
    });
    assert.equal(result.status, "bounced");
    assert.equal(result.error, "Mailbox full");
  });

  it("email.failed → failed + error from failed reason", () => {
    const result = mapResendAccountEmailDelivery({
      event: {
        type: "email.failed",
        data: { failed: { reason: "SMTP timeout" } },
      },
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error, "SMTP timeout");
  });
});

describe("buildTokenUrl", () => {
  it("uses templateUrl with {token} placeholder if provided", () => {
    const url = buildTokenUrl({
      token: "abc 123",
      templateUrl: "https://app.test/r?t={token}",
      path: "/reset",
    });
    /* encodeURIComponent: space → %20 */
    assert.equal(url, "https://app.test/r?t=abc%20123");
  });

  it("templateUrl without {token} placeholder appends ?token=", () => {
    const url = buildTokenUrl({
      token: "abc",
      templateUrl: "https://app.test/r",
      path: "/reset",
    });
    assert.equal(url, "https://app.test/r?token=abc");
  });

  it("templateUrl already has a query string → use & separator", () => {
    const url = buildTokenUrl({
      token: "abc",
      templateUrl: "https://app.test/r?foo=bar",
      path: "/reset",
    });
    assert.equal(url, "https://app.test/r?foo=bar&token=abc");
  });

  it("falls back to appOrigin + path when no templateUrl", () => {
    const url = buildTokenUrl({
      token: "abc",
      appOrigin: "https://app.test",
      path: "/reset",
    });
    assert.equal(url, "https://app.test/reset?token=abc");
  });

  it("strips trailing slash from appOrigin", () => {
    const url = buildTokenUrl({
      token: "abc",
      appOrigin: "https://app.test/",
      path: "/reset",
    });
    assert.equal(url, "https://app.test/reset?token=abc");
  });

  it("returns null when both templateUrl and appOrigin are absent", () => {
    const url = buildTokenUrl({ token: "abc", path: "/reset" });
    assert.equal(url, null);
  });

  it("returns null when both are empty strings", () => {
    const url = buildTokenUrl({
      token: "abc",
      templateUrl: "",
      appOrigin: "  ",
      path: "/reset",
    });
    assert.equal(url, null);
  });
});

describe("appendToken", () => {
  it("appends ?token=… when no existing query", () => {
    assert.equal(appendToken("https://app.test", "abc"), "https://app.test?token=abc");
  });

  it("appends &token=… when query exists", () => {
    assert.equal(
      appendToken("https://app.test?foo=bar", "abc"),
      "https://app.test?foo=bar&token=abc",
    );
  });
});

describe("trimTrailingSlash", () => {
  it("strips a single trailing slash", () => {
    assert.equal(trimTrailingSlash("https://x/"), "https://x");
  });

  it("returns the value unchanged when no trailing slash", () => {
    assert.equal(trimTrailingSlash("https://x"), "https://x");
  });

  it("does not strip mid-path slashes", () => {
    assert.equal(trimTrailingSlash("https://x/y"), "https://x/y");
  });
});

describe("escapeHtml", () => {
  it("escapes <, >, &, \", ' to entities", () => {
    assert.equal(
      escapeHtml('<a href="x">a&b\'c</a>'),
      "&lt;a href=&quot;x&quot;&gt;a&amp;b&#39;c&lt;/a&gt;",
    );
  });

  it("returns the input unchanged when no special chars present", () => {
    assert.equal(escapeHtml("hello world"), "hello world");
  });
});
