/**
 * Social-login conformance proof: the OAuth sign-in seam is mounted.
 *
 * Turnkey social login (Google first, provider-agnostic) routes through
 * Better Auth's `POST /api/auth/sign-in/social` endpoint. The server
 * threads `socialProviders` (clientId/clientSecret from consumer env) into
 * `betterAuth({ socialProviders })`, and the `expo()` + `crossDomain`
 * plugins handle the deep-link / cross-origin callback. The actual provider
 * round trip (302 to accounts.google.com, consent, callback to
 * `/api/auth/callback/google`) CANNOT be automated here — it needs a real
 * Google client + interactive consent. See the manual-testing note below.
 *
 * What this proof CAN assert deployment-agnostically: the social sign-in
 * handler is WIRED. A request with a bogus/omitted provider must produce a
 * Better-Auth error response (4xx) — NOT a 404 "no matching route" with
 * Better Auth's not-found body. A 404-not-mounted means the handler never
 * attached; a 400/422 (or even a 200/302 if a provider happened to match)
 * proves the route exists and Better Auth is processing it.
 *
 * The callback route (`/api/auth/callback/<provider>`) is provided by the
 * same Better Auth handler; if sign-in/social is mounted, callback is too.
 */
import { makeReporter, ORIGIN_WEB, requireEnv } from "./_shared.js";

const { site } = requireEnv();
const r = makeReporter();
const J = () => ({ "content-type": "application/json", origin: ORIGIN_WEB });

/**
 * Better Auth's catch-all returns 404 with a JSON body that mentions "Not
 * found" when no route matches. A mounted social endpoint receiving a bogus
 * provider returns a 400-class error instead. We treat any non-404 as "route
 * mounted"; for a 404 we inspect the body to distinguish "route not mounted"
 * from a provider-specific not-found that still proves the handler ran.
 */
async function describeResponse(res: Response): Promise<string> {
  try {
    return JSON.stringify(await res.clone().json());
  } catch {
    return (await res.text()).slice(0, 200);
  }
}

/*
 * --- Bogus provider ----------------------------------------------------
 * A provider that is definitely not configured. A wired handler rejects it
 * with a Better-Auth validation/processing error, not a routing 404.
 */
const bogus = await fetch(`${site}/api/auth/sign-in/social`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({
    provider: "definitely-not-a-real-provider",
    callbackURL: `${ORIGIN_WEB}/after`,
  }),
});
const bogusBody = await describeResponse(bogus);

if (bogus.status === 404 && /no.?t found|no matching|cannot (POST|find)/i.test(bogusBody)) {
  r.bad(`sign-in/social not mounted (HTTP 404 routing miss): ${bogusBody}`);
} else if (bogus.status >= 200 && bogus.status < 500) {
  r.ok(`sign-in/social mounted — bogus provider handled by Better Auth (HTTP ${bogus.status})`);
} else {
  r.bad(`sign-in/social crashed (HTTP ${bogus.status}): ${bogusBody}`);
}

/*
 * --- Omitted provider --------------------------------------------------
 * Missing required field => Better Auth validation error (400-class), which
 * also proves the handler is parsing the request rather than 404-ing.
 */
const omitted = await fetch(`${site}/api/auth/sign-in/social`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({ callbackURL: `${ORIGIN_WEB}/after` }),
});
const omittedBody = await describeResponse(omitted);

if (omitted.status === 404 && /no.?t found|no matching|cannot (POST|find)/i.test(omittedBody)) {
  r.bad(`sign-in/social not mounted on omitted provider (HTTP 404): ${omittedBody}`);
} else if (omitted.status >= 400 && omitted.status < 500) {
  r.ok(`sign-in/social validates input — omitted provider rejected (HTTP ${omitted.status})`);
} else if (omitted.status >= 200 && omitted.status < 400) {
  r.ok(`sign-in/social reachable on omitted provider (HTTP ${omitted.status}, route mounted)`);
} else {
  r.bad(`sign-in/social crashed on omitted provider (HTTP ${omitted.status}): ${omittedBody}`);
}

console.log(
  "[NOTE] Live Google round trip (consent + /api/auth/callback/google) requires " +
    "a real Google OAuth client and interactive consent; verify it manually per " +
    "docs/social-login-recipe.md. This proof asserts only that the social sign-in " +
    "handler is mounted and processing requests.",
);

r.done("social-login");
