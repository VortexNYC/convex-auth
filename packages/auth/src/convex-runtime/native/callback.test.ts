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
    expect(isAllowedRedirectUrl("//evil.example.com/cb", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("//app.example.com/cb", SITE, TRUSTED)).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isAllowedRedirectUrl("javascript:alert(1)", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("data:text/html,<h1>x</h1>", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("file:///etc/passwd", SITE, TRUSTED)).toBe(false);
  });

  it("allows custom-scheme deep links only via explicit pattern trust", () => {
    const rnTrusted = ["myapp://", "exp://", "exp://*", "exp://192.168.*.*:*/**"];
    expect(isAllowedRedirectUrl("myapp://auth/callback", SITE, rnTrusted)).toBe(true);
    expect(isAllowedRedirectUrl("exp://192.168.1.5:8081/auth", SITE, rnTrusted)).toBe(true);
    expect(isAllowedRedirectUrl("otherapp://auth", SITE, rnTrusted)).toBe(false);
    expect(isAllowedRedirectUrl("exp://10.0.0.5:8081/auth", SITE, ["exp://192.168.*.*:*/**"])).toBe(
      false,
    );
    expect(isAllowedRedirectUrl("exp://evil.example.com/auth", SITE, rnTrusted)).toBe(true);
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
    expect(isAllowedRedirectUrl("javascript:alert(1)", SITE, ["myapp://"])).toBe(false);
    expect(isAllowedRedirectUrl("data:text/html,x", SITE, ["myapp://"])).toBe(false);
    expect(isAllowedRedirectUrl("file:///etc/passwd", SITE, ["myapp://"])).toBe(false);
  });

  it("rejects smuggled and credential-bearing URLs after normalization", () => {
    expect(isAllowedRedirectUrl("https://api.example.com@evil.example.com/", SITE, TRUSTED)).toBe(
      false,
    );
    expect(isAllowedRedirectUrl("\\\\evil.example.com", SITE, TRUSTED)).toBe(false);
    expect(isAllowedRedirectUrl("HTTPS://EVIL.EXAMPLE.COM/x", SITE, TRUSTED)).toBe(false);
  });

  it("allows smuggle-looking inputs that WHATWG resolves same-origin", () => {
    expect(isAllowedRedirectUrl("https:evil.example.com", SITE, TRUSTED)).toBe(true);
    expect(isAllowedRedirectUrl("https:\\evil.example.com", SITE, TRUSTED)).toBe(true);
  });

  it("rejects unparseable input", () => {
    expect(isAllowedRedirectUrl("http://", SITE, TRUSTED)).toBe(false);
  });
});
