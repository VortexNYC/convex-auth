import { describe, expect, it, vi } from "vitest";
import {
  captchaGatesEndpoint,
  DEFAULT_CAPTCHA_ENDPOINTS,
  verifyCaptchaResponse,
  type CaptchaProvider,
} from "./captcha.js";

const turnstileSecret = "1x0000000000000000000000000000000AA"; // nosemgrep: generic.secrets.security.detected-generic-secret.detected-generic-secret

describe("captcha", () => {
  describe("verifyCaptchaResponse", () => {
    it("rejects a missing token", async () => {
      const result = await verifyCaptchaResponse(
        { provider: "cloudflare-turnstile", secretKey: turnstileSecret },
        "",
      );
      expect(result).toEqual({ ok: false, reason: "missing_captcha_response" });
    });

    it("returns ok on a successful provider response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          text: async () => JSON.stringify({ success: true }),
        }),
      );
      const result = await verifyCaptchaResponse(
        { provider: "cloudflare-turnstile", secretKey: turnstileSecret },
        "test-token",
      );
      expect(result).toEqual({ ok: true });
      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(init.method).toBe("POST");
      expect(init.body).toContain("secret=" + encodeURIComponent(turnstileSecret));
      expect(init.body).toContain("response=test-token");
    });

    it("rejects an unsuccessful provider response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          text: async () => JSON.stringify({ success: false }),
        }),
      );
      const result = await verifyCaptchaResponse(
        { provider: "cloudflare-turnstile", secretKey: turnstileSecret },
        "test-token",
      );
      expect(result).toEqual({ ok: false, reason: "captcha_rejected" });
    });

    it("rejects an invalid JSON response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          text: async () => "not json",
        }),
      );
      const result = await verifyCaptchaResponse(
        { provider: "cloudflare-turnstile", secretKey: turnstileSecret },
        "test-token",
      );
      expect(result).toEqual({ ok: false, reason: "invalid_provider_response" });
    });

    it("rejects a response missing the success field", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          text: async () => JSON.stringify({ hostname: "example.com" }),
        }),
      );
      const result = await verifyCaptchaResponse(
        { provider: "cloudflare-turnstile", secretKey: turnstileSecret },
        "test-token",
      );
      expect(result).toEqual({ ok: false, reason: "invalid_provider_response" });
    });

    it("uses the correct siteverify URL for each provider", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        text: async () => JSON.stringify({ success: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const providers: CaptchaProvider[] = [
        "cloudflare-turnstile",
        "google-recaptcha",
        "hcaptcha",
        "captchafox",
      ];
      const expectedUrls: Record<CaptchaProvider, string> = {
        "cloudflare-turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        "google-recaptcha": "https://www.google.com/recaptcha/api/siteverify",
        hcaptcha: "https://api.hcaptcha.com/siteverify",
        captchafox: "https://api.captchafox.com/siteverify",
      };

      for (const provider of providers) {
        await verifyCaptchaResponse({ provider, secretKey: turnstileSecret }, "token");
        const [url] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
          string,
          RequestInit,
        ];
        expect(url).toBe(expectedUrls[provider]);
      }
    });
  });

  describe("captchaGatesEndpoint", () => {
    it("gates default sign-up endpoints", () => {
      for (const path of DEFAULT_CAPTCHA_ENDPOINTS) {
        expect(
          captchaGatesEndpoint({ provider: "cloudflare-turnstile", secretKey: "x" }, path),
        ).toBe(true);
      }
    });

    it("does not gate sign-in by default", () => {
      expect(
        captchaGatesEndpoint(
          { provider: "cloudflare-turnstile", secretKey: "x" },
          "/api/auth/sign-in/email",
        ),
      ).toBe(false);
    });

    it("respects custom endpoints", () => {
      const config = {
        provider: "cloudflare-turnstile" as const,
        secretKey: "x",
        endpoints: ["/api/auth/custom/*"],
      };
      expect(captchaGatesEndpoint(config, "/api/auth/custom/thing")).toBe(true);
      expect(captchaGatesEndpoint(config, "/api/auth/sign-up/email")).toBe(false);
    });
  });
});
