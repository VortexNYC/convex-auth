import { describe, expect, it } from "vitest";
import { isAllowedRedirectUrl } from "./callback.js";

const SITE = "https://api.example.com";
const TRUSTED = ["https://app.example.com"];

describe("isAllowedRedirectUrl", () => {
  it("allows same-origin and trusted-origin absolute URLs", () => {
    expect(isAllowedRedirectUrl("https://api.example.com/cb", SITE, TRUSTED)).toBe(true);
    expect(isAllowedRedirectUrl("https://app.example.com/cb", SITE, TRUSTED)).toBe(true);
  });

  it("allows relative paths — they resolve onto the base origin", () => {
    expect(isAllowedRedirectUrl("/dashboard", SITE, TRUSTED)).toBe(true);
    expect(isAllowedRedirectUrl("dashboard", SITE, TRUSTED)).toBe(true);
    expect(isAllowedRedirectUrl("/cb?x=1#frag", SITE, TRUSTED)).toBe(true);
  });

  it("rejects untrusted absolute URLs", () => {
    expect(isAllowedRedirectUrl("https://evil.example.com/cb", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("http://app.example.com/cb", SITE, TRUSTED)).toBe(false);
  });

  it("rejects protocol-relative URLs — they resolve cross-origin", () => {
    // `//evil.com` previously sailed through `!startsWith("http")` and then
    // resolved to an attacker origin, leaking `?token=` on every route that
    // validated with this function.
    expect(isAllowedRedirectUrl("//evil.example.com/cb", SITE, TRUSTED)).toBe(false);
    // …but the same shape onto a trusted origin resolves there legitimately.
    expect(isAllowedRedirectUrl("//app.example.com/cb", SITE, TRUSTED)).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isAllowedRedirectUrl("javascript:alert(1)", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("data:text/html,<h1>x</h1>", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("file:///etc/passwd", SITE, TRUSTED)).toBe(false);
  });

  it("allows custom-scheme deep links only via explicit pattern trust", () => {
    // React Native / Expo OAuth callbacks redirect to deep links. They have
    // no WHATWG origin, so `scheme://`-style patterns are the trust surface
    // (`buildExpoTrustedOrigins` emits exactly these shapes).
    const rnTrusted = ["myapp://", "exp://", "exp://**", "exp://192.168.*.*:*/**"];
    expect(isAllowedRedirectUrl("myapp://auth/callback", SITE, rnTrusted)).toBe(true);
    expect(isAllowedRedirectUrl("exp://192.168.1.5:8081/auth", SITE, rnTrusted)).toBe(true);
    // Untrusted custom schemes still fail — and so do untrusted scheme+host.
    expect(isAllowedRedirectUrl("otherapp://auth", SITE, rnTrusted)).toBe(false);
    expect(isAllowedRedirectUrl("exp://10.0.0.5:8081/auth", SITE, ["exp://192.168.*.*:*/**"])).toBe(
      false,
    );
    expect(isAllowedRedirectUrl("exp://evil.example.com/auth", SITE, rnTrusted)).toBe(true); // covered by exp://**
    // A trusted http(s) origin must NOT leak into scheme matching — and a
    // trusted scheme must not leak into http(s) matching.
    expect(isAllowedRedirectUrl("myapp://auth", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("https://app.example.com", SITE, rnTrusted)).toBe(false);
  });

  it("supports glob wildcards in http(s) trusted origins", () => {
    expect(isAllowedRedirectUrl("https://x.example.com/cb", SITE, ["https://*.example.com"])).toBe(
      true,
    );
    expect(
      isAllowedRedirectUrl("https://evil-example.com/cb", SITE, ["https://*.example.com"]),
    ).toBe(false);
    expect(
      isAllowedRedirectUrl("https://example.com.evil.com", SITE, ["https://*.example.com"]),
    ).toBe(false);
  });

  it("never aliases opaque schemes through the 'null' origin bucket", () => {
    // `new URL("myapp://x").origin === "null"` — if that string ever entered
    // the normalized set, every opaque-scheme URL would match it.
    expect(isAllowedRedirectUrl("javascript:alert(1)", SITE, ["myapp://"])).toBe(false);
    expect(isAllowedRedirectUrl("data:text/html,x", SITE, ["myapp://"])).toBe(false);
    expect(isAllowedRedirectUrl("file:///etc/passwd", SITE, ["myapp://"])).toBe(false);
  });

  it("rejects smuggled and credential-bearing URLs after normalization", () => {
    // WHATWG parsing turns these into real cross-origin URLs.
    expect(isAllowedRedirectUrl("https://api.example.com@evil.example.com/", SITE, TRUSTED)).toBe(
      false,
    );
    expect(isAllowedRedirectUrl("\\\\evil.example.com", SITE, TRUSTED)).toBe(false);
    // Uppercase scheme is normalized before the origin comparison.
    expect(isAllowedRedirectUrl("HTTPS://EVIL.EXAMPLE.COM/x", SITE, TRUSTED)).toBe(false);
  });

  it("allows smuggle-looking inputs that WHATWG resolves same-origin", () => {
    // `https:evil.example.com` (no slashes) parses as a *relative path*
    // against a same-scheme base — the browser resolves the Location header
    // the same way, so this can only ever land on the base origin.
    expect(isAllowedRedirectUrl("https:evil.example.com", SITE, TRUSTED)).toBe(true);
    expect(isAllowedRedirectUrl("https:\\evil.example.com", SITE, TRUSTED)).toBe(true);
  });

  it("rejects unparseable input", () => {
    expect(isAllowedRedirectUrl("http://", SITE, TRUSTED)).toBe(false);
  });
});
