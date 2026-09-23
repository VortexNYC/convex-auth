/**
 * The landing verifier binds a minted session to the browser that started
 * the OAuth/magic-link flow — closing the cross-browser login-CSRF gap on
 * session-triple landings (`?token=&refreshToken=`).
 *
 * The server boundary mints the cookie on the first navigation that lacks
 * one; this helper is the client-side fallback for code that initiates a
 * flow before a boundary-covered navigation ran, and the read side used to
 * attach the verifier to initiation calls.
 *
 * Non-HttpOnly on purpose — it is a CSRF nonce, not a credential, and must
 * be readable here. It carries no session authority on its own.
 */

const LANDING_VERIFIER_COOKIE = "__convexAuthLandingVerifier";

function isLocalhostHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Read the verifier cookie without minting — the compare side of the
 * browser binding, used when a session triple lands on the URL.
 */
export function readLandingVerifier(): string | null {
  if (typeof document === "undefined" || typeof location === "undefined") {
    return null;
  }
  const isLocalhost = isLocalhostHostname(location.hostname);
  const name = `${isLocalhost ? "" : "__Host-"}${LANDING_VERIFIER_COOKIE}`;
  const prefix = `${name}=`;
  for (const entry of document.cookie.split(";")) {
    const trimmed = entry.trim();
    // An empty-valued entry is treated as absent — an empty verifier must
    // never satisfy the strict landing check against an empty param.
    if (trimmed.startsWith(prefix) && trimmed.length > prefix.length) {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

export function getOrCreateLandingVerifier(): string | undefined {
  if (typeof document === "undefined" || typeof location === "undefined") {
    return undefined;
  }
  const isLocalhost = isLocalhostHostname(location.hostname);
  const name = `${isLocalhost ? "" : "__Host-"}${LANDING_VERIFIER_COOKIE}`;
  const prefix = `${name}=`;
  for (const entry of document.cookie.split(";")) {
    const trimmed = entry.trim();
    if (trimmed.startsWith(prefix) && trimmed.length > prefix.length) {
      return trimmed.slice(prefix.length);
    }
  }
  // `randomUUID` requires a secure context; `getRandomValues` works on
  // plain-HTTP origins too (where the cookie write below may not stick, but
  // the verifier still binds this flow consistently). `crypto` itself may be
  // absent in exotic embedded DOMs — treat that like no DOM at all.
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    return undefined;
  }
  const value =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
  // Mirrors the server serializer: `__Host-` requires Secure — on plain-HTTP
  // non-localhost origins the write will not stick, which matches the
  // server-side cookies' behavior on such origins anyway.
  document.cookie = `${name}=${value}; Path=/; SameSite=Lax` + (isLocalhost ? "" : "; Secure");
  return value;
}
