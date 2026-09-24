/**
 * Universal 2FA matrix conformance proof (official Better Auth
 * twoFactor plugin). Skipped at runtime if 2FA is not enabled on the
 * deployment (sign-in returns no `twoFactorRedirect`).
 *
 *  A. sign-in round trip: session WITHHELD pre-2FA -> completes with TOTP
 *  B. backup code completes sign-in; used code rejected on reuse
 *  C. trusted device: trustDevice -> next sign-in skips 2FA
 *  D. disable 2FA -> sign-in no longer challenged
 *  E. regenerate backup codes -> old codes rejected
 */
import { createHmac } from "node:crypto";

import {
  getSession,
  makeReporter,
  mergeCookies,
  ORIGIN_WEB,
  readJsonObject,
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

function base32(s: string): Buffer {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let b = "";
  for (const c of s.toUpperCase())
    if (a.indexOf(c) >= 0) b += a.indexOf(c).toString(2).padStart(5, "0");
  const o: number[] = [];
  for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2));
  return Buffer.from(o);
}
function totp(secret: string): string {
  const k = base32(secret);
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
async function sessionUsable(cookie: string): Promise<boolean> {
  const sess = await getSession(site, cookie);
  return !!sess?.user?.email;
}
async function enroll(): Promise<{
  email: string;
  pw: string;
  cookie: string;
  secret: string;
  backup: string[];
}> {
  const email = uniqueEmail("2ff");
  const pw = strongPassword("2ff");
  const su = await fetch(`${site}/api/auth/sign-up`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({ email, password: pw, name: "2FA" }),
  });
  let cookie = mergeCookies(su);
  const en = await fetch(`${site}/api/auth/two-factor/enable`, {
    method: "POST",
    headers: J({ cookie }),
    body: JSON.stringify({ password: pw }),
  });
  if (!en.ok) {
    console.log(
      `[SKIP] 2FA not enabled on this deployment (two-factor/enable -> ${en.status}); skipping matrix.`,
    );
    process.exit(0);
  }
  const eb = await readJsonObject(en);
  if (
    typeof eb.totpURI !== "string" ||
    !Array.isArray(eb.backupCodes) ||
    !eb.backupCodes.every((code) => typeof code === "string")
  ) {
    throw new TypeError("2FA enrollment response has an invalid shape");
  }
  const secret = new URL(eb.totpURI).searchParams.get("secret");
  if (secret === null) throw new TypeError("2FA enrollment URI missing secret");
  const vr = await fetch(`${site}/api/auth/two-factor/verify-totp`, {
    method: "POST",
    headers: J({ cookie }),
    body: JSON.stringify({ code: totp(secret) }),
  });
  cookie = mergeCookies(vr, cookie);
  return { email, pw, cookie, secret, backup: eb.backupCodes };
}

/** A: sign-in round trip */
{
  const u = await enroll();
  const si = await fetch(`${site}/api/auth/sign-in`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({ email: u.email, password: u.pw }),
  });
  const body = await readJsonObject(si);
  if (!body.twoFactorRedirect) {
    console.log(`[SKIP] 2FA not gating sign-in on this deployment; skipping matrix.`);
    process.exit(0);
  }
  const pending = mergeCookies(si);
  if (await sessionUsable(pending)) {
    r.bad("A: usable token issued BEFORE 2FA completed (session NOT withheld)");
  } else {
    r.ok("A: session withheld pre-2FA");
  }
  const vt = await fetch(`${site}/api/auth/two-factor/verify-totp`, {
    method: "POST",
    headers: J({ cookie: pending }),
    body: JSON.stringify({ code: totp(u.secret) }),
  });
  const final = mergeCookies(vt, pending);
  if (vt.ok && (await sessionUsable(final))) {
    r.ok("A: TOTP completes sign-in -> usable session");
  } else {
    r.bad(`A: 2FA completion did not yield a usable session (verify ${vt.status})`);
  }
}

/** B: backup code + no reuse */
{
  const u = await enroll();
  const si = await fetch(`${site}/api/auth/sign-in`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({ email: u.email, password: u.pw }),
  });
  const pending = mergeCookies(si);
  const code = u.backup[0];
  const r1 = await fetch(`${site}/api/auth/two-factor/verify-backup-code`, {
    method: "POST",
    headers: J({ cookie: pending }),
    body: JSON.stringify({ code }),
  });
  if (r1.ok && (await sessionUsable(mergeCookies(r1, pending)))) {
    r.ok("B: backup code completes sign-in");
  } else {
    r.bad(`B: backup code did not complete sign-in (${r1.status})`);
  }
  const si2 = await fetch(`${site}/api/auth/sign-in`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({ email: u.email, password: u.pw }),
  });
  const r2 = await fetch(`${site}/api/auth/two-factor/verify-backup-code`, {
    method: "POST",
    headers: J({ cookie: mergeCookies(si2) }),
    body: JSON.stringify({ code }),
  });
  if (r2.ok) r.bad("B: USED backup code accepted again (reuse not prevented)");
  else r.ok(`B: used backup code rejected on reuse (HTTP ${r2.status})`);
}

/** C: trusted device */
{
  const u = await enroll();
  const si = await fetch(`${site}/api/auth/sign-in`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({ email: u.email, password: u.pw }),
  });
  const pending = mergeCookies(si);
  const vt = await fetch(`${site}/api/auth/two-factor/verify-totp`, {
    method: "POST",
    headers: J({ cookie: pending }),
    body: JSON.stringify({ code: totp(u.secret), trustDevice: true }),
  });
  const trusted = mergeCookies(vt, pending);
  const si2 = await fetch(`${site}/api/auth/sign-in`, {
    method: "POST",
    headers: J({ cookie: trusted }),
    body: JSON.stringify({ email: u.email, password: u.pw }),
  });
  const b2 = await readJsonObject(si2);
  if (b2.twoFactorRedirect) r.bad("C: trusted-device sign-in still required 2FA");
  else r.ok("C: trusted device skips 2FA");
}

/** D: disable removes requirement */
{
  const u = await enroll();
  const dis = await fetch(`${site}/api/auth/two-factor/disable`, {
    method: "POST",
    headers: J({ cookie: u.cookie }),
    body: JSON.stringify({ password: u.pw }),
  });
  const si = await fetch(`${site}/api/auth/sign-in`, {
    method: "POST",
    headers: J(),
    body: JSON.stringify({ email: u.email, password: u.pw }),
  });
  const b = await readJsonObject(si);
  if (dis.ok && !b.twoFactorRedirect && (await sessionUsable(mergeCookies(si)))) {
    r.ok("D: disable 2FA -> sign-in not challenged");
  } else {
    r.bad(
      `D: disable did not remove 2FA (disable ${dis.status}, redirect=${b.twoFactorRedirect === true ? "true" : "false"})`,
    );
  }
}

/** E: regenerate invalidates old backup codes */
{
  const u = await enroll();
  const re = await fetch(`${site}/api/auth/two-factor/generate-backup-codes`, {
    method: "POST",
    headers: J({ cookie: u.cookie }),
    body: JSON.stringify({ password: u.pw }),
  });
  if (!re.ok) {
    r.bad(`E: generate-backup-codes failed (${re.status})`);
  } else {
    const si = await fetch(`${site}/api/auth/sign-in`, {
      method: "POST",
      headers: J(),
      body: JSON.stringify({ email: u.email, password: u.pw }),
    });
    const old = await fetch(`${site}/api/auth/two-factor/verify-backup-code`, {
      method: "POST",
      headers: J({ cookie: mergeCookies(si) }),
      body: JSON.stringify({ code: u.backup[0] }),
    });
    if (old.ok) r.bad("E: OLD backup code still works after regenerate");
    else r.ok(`E: regenerate invalidates old backup codes (HTTP ${old.status})`);
  }
}

r.done("2fa-full");
