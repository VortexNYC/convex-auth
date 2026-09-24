/**
 * Opt-in captcha conformance proof for native `convex-auth`. Auto-skips if
 * captcha is not enabled on the deployment (sign-up without a token succeeds).
 *
 * Recommended scoping (matches the package default): sign-up +
 * request-password-reset only. Sign-in MUST NOT be gated — it would 400 every
 * programmatic / native / MCP caller that cannot present a token.
 * This proof asserts that constraint.
 */
import { makeReporter, ORIGIN_WEB, requireEnv, strongPassword, uniqueEmail } from "./_shared.js";

const { site } = requireEnv();
const r = makeReporter();
const J = (extra?: Record<string, string>) => ({
  "content-type": "application/json",
  origin: ORIGIN_WEB,
  ...extra,
});
const pw = strongPassword("cap");

/** (0) auto-skip if captcha is not enabled */
{
  const probe = await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({
      email: uniqueEmail("capz"),
      password: pw,
      name: "Probe",
    }),
  });
  if (probe.ok) {
    console.log("[SKIP] captcha not enabled on this deployment (sign-up without token succeeded).");
    process.exit(0);
  }
}

/** (1) sign-up WITHOUT captcha token must be blocked */
{
  const r1 = await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({
      email: uniqueEmail("capa"),
      password: pw,
      name: "A",
    }),
  });
  const body = await r1.text();
  if (r1.status >= 400 && /captcha|missing|response/i.test(body)) {
    r.ok(`sign-up WITHOUT captcha token rejected (HTTP ${r1.status})`);
  } else {
    r.bad(`sign-up WITHOUT token NOT blocked (HTTP ${r1.status})`);
  }
}

/** (2) request-password-reset WITHOUT captcha token must also be blocked */
{
  const r1b = await fetch(`${site}/api/auth/request-password-reset`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({
      email: uniqueEmail("capa"),
    }),
  });
  const body = await r1b.text();
  if (r1b.status >= 400 && /captcha|missing|response/i.test(body)) {
    r.ok(`request-password-reset WITHOUT captcha token rejected (HTTP ${r1b.status})`);
  } else {
    r.bad(`request-password-reset WITHOUT token NOT blocked (HTTP ${r1b.status})`);
  }
}

/**
 * (3) sign-up WITH a token: the deployment validates against the
 *     provider (always-pass test secret -> success; always-fail -> 4xx).
 *     Either is a valid PASS for "real provider verification ran" — the
 *     point is the gate dispatched, not which test secret was wired.
 */
{
  const r2 = await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: J({ "x-captcha-response": "test-token-any-value" }),
    body: JSON.stringify({
      email: uniqueEmail("capb"),
      password: pw,
      name: "B",
    }),
  });
  if ((r2.status >= 200 && r2.status < 300) || r2.status === 403 || r2.status === 401) {
    r.ok(`sign-up WITH token dispatched to provider (HTTP ${r2.status})`);
  } else {
    r.bad(`sign-up WITH token returned unexpected HTTP ${r2.status}`);
  }
}

/**
 * (4) sign-in WITHOUT a token MUST still work (non-regression: the
 *     deliberate scoping protects programmatic / native / MCP callers).
 */
{
  const email = uniqueEmail("capc");
  await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: J({ "x-captcha-response": "t" }),
    body: JSON.stringify({ email, password: pw, name: "C" }),
  });
  const r3 = await fetch(`${site}/api/auth/sign-in/email`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({ email, password: pw }),
  });
  if (r3.status >= 200 && r3.status < 300) {
    r.ok("sign-in WITHOUT token still works (sign-in deliberately NOT gated)");
  } else {
    r.bad(`sign-in WITHOUT token was blocked (HTTP ${r3.status}) — scoping regression`);
  }
}

r.done("captcha");
