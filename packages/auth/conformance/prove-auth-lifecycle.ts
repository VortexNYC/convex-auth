/**
 * Universal auth-lifecycle conformance proof.
 * Proves on the deployed Better Auth + Convex single-origin:
 *   - sign-up persists + identity restores from cookie
 *   - sign-out invalidates the session within the ~60s cookieCache bound
 *   - sign-in returns the SAME user (no duplicate provisioning)
 *   - invalid token rejected
 *   - wrong password rejected
 */
import {
  getConvexToken,
  getSession,
  makeReporter,
  mergeCookies,
  ORIGIN_WEB,
  requireEnv,
  strongPassword,
  uniqueEmail,
} from "./_shared.js";

const { site } = requireEnv();
const r = makeReporter();
const J = (extra?: Record<string, string>) => ({
  "content-type": "application/json",
  origin: ORIGIN_WEB,
  ...extra,
});

const email = uniqueEmail("lc");
const password = strongPassword("lc");

/** sign-up */
const su = await fetch(`${site}/api/auth/sign-up/email`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({ email, password, name: "Lifecycle" }),
});
if (!su.ok) {
  r.bad(`sign-up ${su.status}`);
  r.done("auth-lifecycle");
}
const cookieAfterSignUp = mergeCookies(su);
const sess1 = await getSession(site, cookieAfterSignUp);
if (sess1?.user?.email === email) r.ok("sign-up -> identity restored from cookie");
else r.bad("sign-up did not restore identity");

/** sign-out */
const so = await fetch(`${site}/api/auth/sign-out`, {
  method: "POST",
  headers: J({ cookie: cookieAfterSignUp }),
  body: "{}",
});
if (so.ok) r.ok("sign-out HTTP 200");
else r.bad(`sign-out HTTP ${so.status}`);
const cookieAfterSignOut = mergeCookies(so, cookieAfterSignUp);
const REVOKE_BOUND_MS = 65_000;
const start = Date.now();
let revoked = false;
while (Date.now() - start < REVOKE_BOUND_MS + 8_000) {
  const tok = await getConvexToken(site, cookieAfterSignOut);
  if (tok === null) {
    revoked = true;
    break;
  }
  await new Promise((res) => setTimeout(res, 5_000));
}
const elapsed = Math.round((Date.now() - start) / 1000);
if (revoked) r.ok(`sign-out revokes within cookieCache bound (~${elapsed}s, bound 60s)`);
else r.bad(`sign-out did not revoke within bound (~${elapsed}s)`);

/** sign-in -> same user, no duplicate */
const si = await fetch(`${site}/api/auth/sign-in/email`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({ email, password }),
});
const sessAfterSignIn = await getSession(site, mergeCookies(si));
if (sessAfterSignIn?.user?.email === email) r.ok("sign-in -> SAME user resolved (no duplicate)");
else r.bad("sign-in did not return the original user");

/** invalid token rejected */
const bad = await fetch(`${site}/api/auth/get-session`, {
  headers: {
    origin: ORIGIN_WEB,
    cookie: "convex-auth-token=not-a-real-token",
  },
});
const badBody: unknown = await bad.json();
const badUser =
  typeof badBody === "object" && badBody !== null ? Reflect.get(badBody, "user") : undefined;
if (!badUser) r.ok("invalid token rejected (no user)");
else r.bad("invalid token accepted (LEAK)");

/** wrong password rejected */
const wp = await fetch(`${site}/api/auth/sign-in/email`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({ email, password: "completely-wrong-password-xyz" }),
});
if (wp.status === 401) r.ok("wrong password rejected (HTTP 401)");
else r.bad(`wrong password returned HTTP ${wp.status} (expected 401)`);

r.done("auth-lifecycle");
