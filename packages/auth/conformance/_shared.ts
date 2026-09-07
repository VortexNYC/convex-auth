/**
 * Shared helpers for the convex-auth conformance suite.
 * No consumer `api.*` imports — only HTTP + standard libs.
 */
import { parseSetCookie } from "set-cookie-parser";

export const ORIGIN_WEB = "http://127.0.0.1:4173";
export const ORIGIN_NATIVE = "myapp://";

export const NATIVE_HEADERS = {
  "content-type": "application/json",
  "expo-origin": ORIGIN_NATIVE,
  "x-skip-oauth-proxy": "true",
};

export function requireEnv(): { site: string; convexUrl: string } {
  const site = process.env.CONVEX_SITE_URL ?? "";
  const convexUrl = process.env.CONVEX_URL ?? "";
  if (!site || !convexUrl) {
    console.error("[ERROR] CONVEX_SITE_URL and CONVEX_URL are required");
    process.exit(1);
  }
  return { site, convexUrl };
}

export function makeReporter(): {
  ok: (m: string) => void;
  bad: (m: string) => void;
  done: (label: string) => never;
} {
  let fails = 0;
  return {
    ok: (m) => console.log(`[PASS] ${m}`),
    bad: (m) => {
      fails += 1;
      console.error(`[FAIL] ${m}`);
    },
    done: (label) => {
      console.log(
        fails === 0
          ? `\n[SUCCESS] ${label}`
          : `\n[FAILURE] ${fails} check${fails === 1 ? "" : "s"} failed for ${label}.`,
      );
      process.exit(fails === 0 ? 0 : 1);
    },
  };
}

export function mergeCookies(res: Response, prev = ""): string {
  const jar = new Map<string, string>();
  for (const p of prev.split("; ").filter(Boolean)) {
    const i = p.indexOf("=");
    jar.set(p.slice(0, i), p.slice(i + 1));
  }
  const incoming = parseSetCookie(res, { map: true, decodeValues: false });
  for (const [k, v] of Object.entries(incoming)) {
    jar.set(k, v.value);
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a JSON object response");
  }
  return Object.fromEntries(Object.entries(value));
}

export async function getSession(
  site: string,
  cookie: string,
  headers: Record<string, string> = { origin: ORIGIN_WEB },
): Promise<{ user?: { email?: string } } | null> {
  const r = await fetch(`${site}/api/auth/session`, {
    headers: { ...headers, cookie },
  });
  if (!r.ok) return null;
  const body: unknown = await r.json();
  if (body === null) return null;
  if (typeof body !== "object") return null;
  const user = Reflect.get(body, "user");
  if (typeof user !== "object" || user === null) return {};
  const email = Reflect.get(user, "email");
  return typeof email === "string" ? { user: { email } } : { user: {} };
}

export async function getConvexToken(
  site: string,
  cookie: string,
  headers: Record<string, string> = { origin: ORIGIN_WEB },
): Promise<string | null> {
  const r = await fetch(`${site}/api/auth/convex/token`, {
    headers: { ...headers, cookie },
  });
  const body = await readJsonObject(r);
  return typeof body.token === "string" ? body.token : null;
}

export function uniqueEmail(label: string): string {
  return `test+${label}${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
}

export function strongPassword(label: string): string {
  return `Tt9$qZ-${label}-${Date.now()}-Kp7!ab`;
}
