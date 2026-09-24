/**
 * Account-email conformance proof: password-reset + email-verification
 * transport seam.
 *
 * The runtime wires Better Auth's `sendResetPassword` /
 * `sendVerificationEmail` callbacks to the consumer-supplied `sendEmail`
 * transport (Style A: package owns policy + tokenized URL, consumer owns
 * rendering + delivery). Conformance runs over HTTP only and cannot see
 * the server-side transport, so it cannot directly assert an email was
 * dispatched. It instead asserts the BA endpoints are MOUNTED and ACCEPT
 * the request (not 404/500) — i.e. the routes the transport hangs off of
 * exist and don't crash.
 *
 * Full transport-firing assertion (that `sendEmail` was invoked with the
 * right `kind`/`to`/tokenized `url`) requires deployment-side
 * instrumentation: wire a test `sendEmail` that records into a Convex
 * table and expose a query the sandbox reads. That lives in the sandbox,
 * not here — see packages/better-auth/src/convex.test.ts for the
 * unit-level wiring proof.
 */
import {
  makeReporter,
  mergeCookies,
  ORIGIN_WEB,
  requireEnv,
  strongPassword,
  uniqueEmail,
} from "./_shared.js";

const { site } = requireEnv();
const r = makeReporter();
const J = () => ({ "content-type": "application/json", origin: ORIGIN_WEB });

/*
 * Better Auth returns 200 for forget-password regardless of whether the
 * address exists (anti-enumeration). A mounted, wired endpoint must NOT
 * 404 (route missing) or 500 (callback threw). Sign up first so the
 * account is real and the reset callback path is actually exercised.
 */
const email = uniqueEmail("acctmail");
const password = strongPassword("acctmail");

const signUp = await fetch(`${site}/api/auth/sign-up/email`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({ email, password, name: "Acct Mail" }),
});
if (signUp.status >= 200 && signUp.status < 300) {
  r.ok(`sign-up accepted (HTTP ${signUp.status})`);
} else {
  r.bad(`sign-up rejected (HTTP ${signUp.status}) — cannot exercise email flows`);
}
const cookie = mergeCookies(signUp);

/*
 * --- Password reset request -------------------------------------------
 * Better Auth route: POST /request-password-reset (alias: /forget-password).
 */
const reset = await fetch(`${site}/api/auth/request-password-reset`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({ email, redirectTo: `${ORIGIN_WEB}/reset` }),
});
if (reset.status === 404) {
  r.bad("request-password-reset endpoint not mounted (HTTP 404)");
} else if (reset.status >= 500) {
  r.bad(`request-password-reset crashed (HTTP ${reset.status}) — sendEmail callback likely threw`);
} else if (reset.status >= 200 && reset.status < 300) {
  r.ok(`request-password-reset accepted (HTTP ${reset.status})`);
} else {
  /*
   * 4xx that isn't 404 (e.g. validation) still proves the route exists
   * and didn't crash; flag it for visibility but don't fail the suite.
   */
  r.ok(`request-password-reset reachable, returned HTTP ${reset.status} (route mounted, no crash)`);
}

/*
 * --- Email verification send ------------------------------------------
 * Better Auth route: POST /send-verification-email. Requires a valid
 * session for the target user (uses the signed-up cookie).
 */
const verify = await fetch(`${site}/api/auth/send-verification-email`, {
  method: "POST",
  headers: { ...J(), cookie },
  body: JSON.stringify({ email, callbackURL: `${ORIGIN_WEB}/verified` }),
});
if (verify.status === 404) {
  r.bad("send-verification-email endpoint not mounted (HTTP 404)");
} else if (verify.status >= 500) {
  r.bad(
    `send-verification-email crashed (HTTP ${verify.status}) — sendEmail callback likely threw`,
  );
} else if (verify.status >= 200 && verify.status < 300) {
  r.ok(`send-verification-email accepted (HTTP ${verify.status})`);
} else {
  r.ok(
    `send-verification-email reachable, returned HTTP ${verify.status} (route mounted, no crash)`,
  );
}

r.done("account-emails");
