import { verifyCaptchaResponse, type CaptchaConfig } from "./captcha.js";

export const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_MIN_PASSWORD_LENGTH = 8;
export const DEFAULT_MAX_PASSWORD_LENGTH = 128;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const DEFAULT_RATE_LIMIT_MAX_ATTEMPTS = 5;
export const DEFAULT_MIN_USERNAME_LENGTH = 3;
export const DEFAULT_MAX_USERNAME_LENGTH = 32;

const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_+-]\.?)+[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function normalizeEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

const USERNAME_REGEX = /^[a-z0-9._-]+$/;

export function normalizeUsername(username: string | undefined): string | undefined {
  const normalized = username?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export function normalizePhone(phone: string | undefined): string | undefined {
  const normalized = phone?.trim().replace(/[\s().-]/g, "");
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

export function validatePassword(
  password: string,
  minLength: number,
  maxLength: number,
): { valid: true } | { valid: false; reason: "too_short" | "too_long" } {
  if (password.length < minLength) {
    return { valid: false, reason: "too_short" };
  }
  if (password.length > maxLength) {
    return { valid: false, reason: "too_long" };
  }
  return { valid: true };
}

export async function requireCaptcha(
  config: CaptchaConfig | undefined,
  captchaToken: string | undefined,
): Promise<void> {
  if (!config) return;
  if (!captchaToken) {
    throw new Error("Captcha response is required");
  }
  const result = await verifyCaptchaResponse(config, captchaToken);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}
