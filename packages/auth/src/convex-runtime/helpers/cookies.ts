const DEFAULT_COOKIE_PREFIX = "convex-auth";
const SESSION_TOKEN_COOKIE_NAME = "session_token";

function cookieName(prefix: string): string {
  return `${prefix}.${SESSION_TOKEN_COOKIE_NAME}`;
}

function parseCookieHeader(headers: Headers): Map<string, string> {
  const cookieHeader = headers.get("cookie") ?? "";
  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

export type GetSessionCookieOptions = {
  cookiePrefix?: string;
};

export function getSessionCookie(
  headers: Headers,
  options?: GetSessionCookieOptions,
): string | null {
  const prefix = options?.cookiePrefix ?? DEFAULT_COOKIE_PREFIX;
  const cookies = parseCookieHeader(headers);
  return cookies.get(cookieName(prefix)) ?? null;
}

export function getCookie(headers: Headers, name: string): string | null {
  return parseCookieHeader(headers).get(name) ?? null;
}
