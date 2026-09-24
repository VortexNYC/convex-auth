/**
 * Universal breached-password conformance proof (official Better Auth
 * haveIBeenPwned plugin). Default enabled in the package; this verifies
 * the deployment actually enforces it.
 */
import {
  getConvexToken,
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

/**
 * 13 chars (passes a 12-char min length) and overwhelmingly present in
 * the HIBP corpus — must be rejected by the screening, not the length.
 */
const BREACHED = "password12345";

const b = await fetch(`${site}/api/auth/sign-up/email`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({
    email: uniqueEmail("brk"),
    password: BREACHED,
    name: "Brk",
  }),
});
if (b.status >= 400 && /pwn|breach|compromis|exposed|data breach/i.test(await b.text())) {
  r.ok(`known-breached password rejected (HTTP ${b.status})`);
} else {
  r.bad(`known-breached password NOT rejected (HTTP ${b.status})`);
}

const strong = strongPassword("brk");
const s = await fetch(`${site}/api/auth/sign-up/email`, {
  method: "POST",
  headers: J(),
  body: JSON.stringify({
    email: uniqueEmail("str"),
    password: strong,
    name: "Str",
  }),
});
if (s.status >= 200 && s.status < 300) {
  const tok = await getConvexToken(site, mergeCookies(s));
  if (tok) r.ok("strong unique password accepted -> usable Convex token");
  else r.bad("strong password accepted but no Convex token issued");
} else {
  r.bad(`strong unique password REJECTED (HTTP ${s.status})`);
}

r.done("breached-password");
