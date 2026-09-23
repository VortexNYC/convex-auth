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
 * Minimal glob match — `*` matches within a path segment (`[^/]*`), `**`
 * crosses separators (`.*`), `?` matches one non-separator char. Case
 * insensitive because URL schemes/hosts are.
 */
function globMatch(value: string, pattern: string): boolean {
  const rx = pattern
    .split("**")
    .map((segment) =>
      segment
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]"),
    )
    .join(".*");
  return new RegExp(`^${rx}$`, "i").test(value);
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
  try {
    target = new URL(url, baseOrigin);
  } catch {
    return false;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return matchesSchemePattern(target, trustedOrigins);
  }
  if (target.origin === baseOrigin) {
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
