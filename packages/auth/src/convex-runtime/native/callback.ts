function normalizeTrustedOrigins(origins: string[]): string[] {
  // Only http(s) origins can be compared by origin equality. Custom-scheme
  // entries ("myapp://", "exp://**") produce `origin === "null"` — letting
  // that string into the set would alias EVERY opaque-scheme URL to it, so
  // they are excluded here and handled by pattern matching instead.
  return origins
    .map((origin) => {
      try {
        const parsed = new URL(origin).origin;
        return parsed === "null" ? "" : parsed;
      } catch {
        return "";
      }
    })
    .filter((origin) => origin !== "");
}

/**
 * Minimal glob match — `*` matches within a path segment (stops at `/`),
 * `**` crosses separators, `?` matches one non-separator char. Hand-rolled
 * (no RegExp construction) so no escaping or ReDoS questions ever apply —
 * CodeQL-clean by construction. Case insensitive because URL schemes/hosts
 * are. Classic two-pointer with a backtrack point per star kind.
 */
function globMatch(value: string, pattern: string): boolean {
  const v0 = value.toLowerCase();
  const p0 = pattern.toLowerCase();
  let v = 0;
  let p = 0;
  let starP = -1;
  let starV = -1;
  let globP = -1;
  let globV = -1;
  while (v < v0.length) {
    if (p0.startsWith("**", p)) {
      globP = p;
      globV = v;
      p += 2;
      continue;
    }
    const pc = p0[p];
    if (pc === "*") {
      starP = p;
      starV = v;
      p++;
      continue;
    }
    const charMatches = pc === "?" ? v0[v] !== "/" : pc === v0[v];
    if (p < p0.length && charMatches) {
      v++;
      p++;
      continue;
    }
    // Backtrack: `*` can extend within the segment (never past `/`), then
    // `**` can extend across anything.
    if (starP !== -1 && v0[starV] !== "/" && starV < v0.length) {
      v = ++starV;
      p = starP + 1;
      continue;
    }
    if (globP !== -1) {
      v = ++globV;
      p = globP + 2;
      continue;
    }
    return false;
  }
  while (p0.startsWith("**", p)) p += 2;
  while (p0[p] === "*") p++;
  return p === p0.length;
}

/**
 * Custom-scheme redirect targets — React Native / Expo deep links
 * (`myapp://auth`, `exp://192.168.x.x:8081`). They have no WHATWG origin,
 * so they are allowed only by an explicit non-http(s) `trustedOrigins`
 * pattern (see `buildExpoTrustedOrigins`):
 *   - "myapp://"          — trust the whole scheme
 *   - "myapp://auth"      — trust this scheme + authority (any path under it)
 *   - "exp://**"          — glob
 * `javascript:`/`data:`/`file:` can never match: the pattern must contain
 * `://` and the URL must share its scheme — `file://x` is only allowed if a
 * developer explicitly trusts `file://`.
 */
function matchesSchemePattern(target: URL, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const sep = pattern.indexOf("://");
    if (sep === -1) continue;
    const scheme = pattern.slice(0, sep).toLowerCase();
    if (scheme === "http" || scheme === "https") continue;
    if (`${scheme}:` !== target.protocol) continue;
    const rest = pattern.slice(sep + 3);
    if (rest === "") return true;
    if (rest.includes("*") || rest.includes("?")) {
      if (globMatch(target.href, pattern)) return true;
      continue;
    }
    try {
      if (new URL(pattern).host === target.host) return true;
    } catch {
      // Malformed pattern — not trusted.
    }
  }
  return false;
}

/**
 * The single base every redirect target resolves against — validation and the
 * final `Location` header must share it. `SITE_URL` (the app origin) wins so
 * relative callbacks land on the app; the site origin is the fallback for
 * deployments that host the app themselves. Splitting the bases lets
 * scheme-relative smuggles (`https:evil.example.com`) validate as same-origin
 * under one base and resolve absolute under the other — token exfiltration.
 */
export function redirectBaseOrigin(requestOrigin?: string): string {
  return process.env.SITE_URL ?? process.env.CONVEX_SITE_URL ?? requestOrigin ?? "http://localhost";
}

/**
 * Whether `url` may receive a redirect that carries tokens or session state.
 * Resolution against `baseOrigin` happens before the comparison, so
 * protocol-relative (`//evil.com`), backslash, and scheme-smuggled values
 * resolve to their real target rather than slipping through as "relative".
 * http(s) targets match the base origin or a trusted origin (exact or
 * glob — `https://*.example.com`); custom-scheme targets (React Native /
 * Expo deep links) match only explicit scheme patterns in `trustedOrigins`.
 */
export function isAllowedRedirectUrl(
  url: string,
  baseOrigin: string,
  trustedOrigins: string[],
): boolean {
  let target: URL;
  let base: string;
  try {
    base = new URL(baseOrigin).origin;
    target = new URL(url, base);
  } catch {
    return false;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return matchesSchemePattern(target, trustedOrigins);
  }
  if (target.origin === base) {
    return true;
  }
  const allowed = new Set(normalizeTrustedOrigins(trustedOrigins));
  if (allowed.has(target.origin)) {
    return true;
  }
  return trustedOrigins.some(
    (pattern) =>
      (pattern.includes("*") || pattern.includes("?")) && globMatch(target.origin, pattern),
  );
}
