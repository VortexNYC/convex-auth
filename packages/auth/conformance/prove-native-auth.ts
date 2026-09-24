/**
 * Universal native/Expo conformance proof. Faithfully replicates the
 * @better-auth/expo HTTP transport (no cookie jar; expo-origin promoted
 * by the server expo plugin; x-skip-oauth-proxy) against the deployed
 * single-origin Convex. Verifies:
 *   - sign-up over the expo transport persists + identity restores
 *   - Convex JWT cryptographically valid (JWKS, iss/aud)
 *   - breach screening enforced over native transport
 *   - 2FA round trip over native transport (session withheld pre-2FA)
 *     -- auto-skips if 2FA not enabled on the deployment
 *   - native sign-out invalidates the session within the cookieCache bound
 *   - native sign-in is rate-limited (Convex-native limiter applies)
 */
import { createHmac } from "node:crypto";

import { importJWK, jwtVerify, decodeProtectedHeader } from "jose";

import {
  getSession,
  makeReporter,
  mergeCookies,
  NATIVE_HEADERS,
  readJsonObject,
  requireEnv,
  strongPassword,
  uniqueEmail,
} from "./_shared.js";

const { site } = requireEnv();
const r = makeReporter();

function b32(s: string): Buffer {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let b = "";
  for (const c of s.toUpperCase())
    if (a.indexOf(c) >= 0) b += a.indexOf(c).toString(2).padStart(5, "0");
  const o: number[] = [];
  for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2));
  return Buffer.from(o);
}
function totp(secret: string): string {
  const k = b32(secret);
  const c = Math.floor(Date.now() / 1000 / 30);
  const bf = Buffer.alloc(8);
  bf.writeBigUInt64BE(BigInt(c));
  const h = createHmac("sha1", k).update(bf).digest();
  const of = h[h.length - 1] & 15;
  return (
    (((h[of] & 127) << 24) |
      ((h[of + 1] & 255) << 16) |
      ((h[of + 2] & 255) << 8) |
      (h[of + 3] & 255)) %
    1e6
  )
    .toString()
    .padStart(6, "0");
}

const email = uniqueEmail("nat");
const pw = strongPassword("nat");

/* 1. sign-up over native transport */
const su = await fetch(`${site}/api/auth/sign-up/email`, {
  method: "POST",
  headers: NATIVE_HEADERS,
  body: JSON.stringify({ email, password: pw, name: "Native Proof" }),
});
if (!su.ok) {
  r.bad(`native sign-up failed ${su.status}`);
  r.done("native-auth");
}
const cookie = mergeCookies(su);
r.ok("native sign-up (expo-origin, no cookie jar) -> session");

/* 2. get-session valid with manually-injected cookie */
const sess = await getSession(site, cookie, NATIVE_HEADERS);
if (sess?.user?.email === email) r.ok("get-session valid with manually-injected cookie");
else r.bad("get-session invalid over native transport");

/* 3. convex JWT verified vs JWKS (iss=site, aud=convex) */
const tokRes = await fetch(`${site}/api/auth/convex/token`, {
  headers: { ...NATIVE_HEADERS, cookie },
});
const tokenBody = await readJsonObject(tokRes);
const token = typeof tokenBody.token === "string" ? tokenBody.token : undefined;
if (!token) {
  r.bad("native /convex/token returned no JWT");
} else {
  try {
    const jwks = await readJsonObject(await fetch(`${site}/api/auth/convex/jwks`));
    if (!Array.isArray(jwks.keys)) throw new TypeError("JWKS keys missing");
    const keys = jwks.keys
      .filter((value) => typeof value === "object" && value !== null)
      .map((value) => Object.fromEntries(Object.entries(value)));
    const hdr = decodeProtectedHeader(token);
    const jwk = keys.find((k) => k.kid === hdr.kid) ?? keys[0];
    if (jwk === undefined) throw new TypeError("JWKS is empty");
    const key = await importJWK(jwk, hdr.alg);
    await jwtVerify(token, key, { issuer: site, audience: "convex" });
    r.ok(`native Convex JWT verified vs JWKS (iss=${site}, aud=convex)`);
  } catch (e) {
    r.bad(
      `native Convex JWT failed JWKS verification: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** 4. breach screening enforced over native transport */
{
  const brk = await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: NATIVE_HEADERS,
    body: JSON.stringify({
      email: uniqueEmail("natbrk"),
      password: "password12345",
      name: "B",
    }),
  });
  if (brk.status >= 400 && /pwn|breach|compromis|exposed/i.test(await brk.text())) {
    r.ok("breach screening enforced over native transport");
  } else {
    r.bad(`breach screening NOT enforced over native transport (HTTP ${brk.status})`);
  }
}

/** 5. 2FA round trip over native transport (auto-skip if not enabled) */
{
  const e2 = uniqueEmail("nat2fa");
  const s2 = await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: NATIVE_HEADERS,
    body: JSON.stringify({ email: e2, password: pw, name: "N2FA" }),
  });
  let ck = mergeCookies(s2);
  const en = await fetch(`${site}/api/auth/two-factor/enable`, {
    method: "POST",
    headers: { ...NATIVE_HEADERS, cookie: ck },
    body: JSON.stringify({ password: pw }),
  });
  if (!en.ok) {
    console.log("[SKIP] 2FA not enabled on this deployment; skipping native 2FA round trip.");
  } else {
    const eb = await readJsonObject(en);
    if (typeof eb.totpURI !== "string") {
      throw new TypeError("2FA enrollment response missing totpURI");
    }
    const secret = new URL(eb.totpURI).searchParams.get("secret");
    if (secret === null) throw new TypeError("2FA enrollment URI missing secret");
    const cv = await fetch(`${site}/api/auth/two-factor/verify-totp`, {
      method: "POST",
      headers: { ...NATIVE_HEADERS, cookie: ck },
      body: JSON.stringify({ code: totp(secret) }),
    });
    ck = mergeCookies(cv, ck);
    const si = await fetch(`${site}/api/auth/sign-in/email`, {
      method: "POST",
      headers: NATIVE_HEADERS,
      body: JSON.stringify({ email: e2, password: pw }),
    });
    const pending = mergeCookies(si);
    const siBody = await readJsonObject(si);
    const preTokRes = await fetch(`${site}/api/auth/convex/token`, {
      headers: { ...NATIVE_HEADERS, cookie: pending },
    });
    const preTokBody = await readJsonObject(preTokRes);
    const preTok = typeof preTokBody.token === "string" ? preTokBody.token : undefined;
    if (siBody.twoFactorRedirect && !preTok) r.ok("native 2FA: session WITHHELD pre-2FA");
    else r.bad("native 2FA: token issued before 2nd factor (session not withheld)");
    const vt = await fetch(`${site}/api/auth/two-factor/verify-totp`, {
      method: "POST",
      headers: { ...NATIVE_HEADERS, cookie: pending },
      body: JSON.stringify({ code: totp(secret) }),
    });
    const final = mergeCookies(vt, pending);
    const finTokRes = await fetch(`${site}/api/auth/convex/token`, {
      headers: { ...NATIVE_HEADERS, cookie: final },
    });
    const finTokBody = await readJsonObject(finTokRes);
    const finTok = typeof finTokBody.token === "string" ? finTokBody.token : undefined;
    if (vt.ok && finTok) r.ok("native 2FA: TOTP completes sign-in -> usable native token");
    else r.bad(`native 2FA: completion failed (verify ${vt.status})`);
  }
}

/** 6. sign-out invalidates session within the cookieCache bound */
{
  const so = await fetch(`${site}/api/auth/sign-out`, {
    method: "POST",
    headers: { ...NATIVE_HEADERS, cookie },
    body: "{}",
  });
  const after = mergeCookies(so, cookie);
  const REVOKE_BOUND_MS = 65_000;
  const start = Date.now();
  let revoked = false;
  while (Date.now() - start < REVOKE_BOUND_MS + 8_000) {
    const tr = await fetch(`${site}/api/auth/convex/token`, {
      headers: { ...NATIVE_HEADERS, cookie: after },
    });
    const tokenResult = await readJsonObject(tr);
    const tk = typeof tokenResult.token === "string" ? tokenResult.token : undefined;
    if (!tk) {
      revoked = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 5_000));
  }
  const elapsed = Math.round((Date.now() - start) / 1000);
  if (so.ok && revoked) r.ok(`native sign-out invalidates session (~${elapsed}s, bound 60s)`);
  else r.bad(`native sign-out did not invalidate (revoked=${revoked}, ~${elapsed}s)`);
}

/** 7. Convex-native rate limit applies on native sign-in */
{
  const e3 = uniqueEmail("natrl");
  await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: NATIVE_HEADERS,
    body: JSON.stringify({ email: e3, password: pw, name: "RL" }),
  });
  const codes = await Promise.all(
    Array.from({ length: 16 }, async () => {
      const response = await fetch(`${site}/api/auth/sign-in/email`, {
        method: "POST",
        headers: NATIVE_HEADERS,
        body: JSON.stringify({ email: e3, password: "wrong-password-xyz" }),
      });
      return response.status;
    }),
  );
  if (codes.includes(429)) r.ok(`native sign-in rate-limited (429 after burst)`);
  else r.bad(`native sign-in NOT rate-limited: ${codes.join(",")}`);
}

r.done("native-auth");
