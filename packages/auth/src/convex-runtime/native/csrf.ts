import { isAllowedRedirectUrl } from "./callback.js";

export type NativeCsrfValidationResult =
  | { allowed: true }
  | { allowed: false; status: number; reason: string };

export function validateCsrfHeaders(
  request: Request,
  trustedOrigins: string[],
  disableCSRFCheck?: boolean,
): NativeCsrfValidationResult {
  if (disableCSRFCheck) {
    return { allowed: true };
  }

  const method = request.method;
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") {
    return { allowed: true };
  }

  const headers = request.headers;
  const hasCookie = headers.has("cookie");
  const site = headers.get("sec-fetch-site");
  const mode = headers.get("sec-fetch-mode");
  const dest = headers.get("sec-fetch-dest");

  if (site || mode || dest) {
    if (site === "cross-site" && mode === "navigate") {
      return {
        allowed: false,
        status: 403,
        reason: "cross_site_navigation_login_blocked",
      };
    }

    if (site === "cross-site" || site === "same-site") {
      // Cross-origin POSTs — including same-site siblings, whose requests
      // still carry our SameSite=Lax cookies. Browsers always send Origin
      // on cross-origin POSTs, so require and validate it. Better Auth
      // treats this identically: fetch-metadata requests validate
      // origin/referer rather than trusting the site classification.
      return validateOriginOrReferer(request, trustedOrigins, { requireWhenNoCookie: true });
    }

    // same-origin / none: the metadata already asserts the request's own
    // context, but still validate Origin/Referer when present — a header
    // set that contradicts the metadata (same-site claim, foreign Origin)
    // cannot come from a real browser and fails closed.
    return validateOriginOrReferer(request, trustedOrigins, { requireWhenNoCookie: false });
  }

  if (hasCookie) {
    return validateOriginOrReferer(request, trustedOrigins, { requireWhenNoCookie: true });
  }

  // No cookies and no Fetch Metadata headers: treat as a first-login or
  // non-browser request and allow the action to authenticate.
  return { allowed: true };
}

function validateOriginOrReferer(
  request: Request,
  trustedOrigins: string[],
  { requireWhenNoCookie }: { requireWhenNoCookie: boolean },
): NativeCsrfValidationResult {
  const headers = request.headers;
  const origin = headers.get("origin");
  const referer = headers.get("referer");
  const requestOrigin = new URL(request.url).origin;

  if (origin === "null") {
    return {
      allowed: false,
      status: 403,
      reason: "missing_or_null_origin",
    };
  }

  const originToValidate = origin ?? referer;
  if (!originToValidate) {
    if (requireWhenNoCookie) {
      return {
        allowed: false,
        status: 403,
        reason: "missing_or_null_origin",
      };
    }
    return { allowed: true };
  }

  const originUrl = originToValidate.startsWith("http")
    ? originToValidate
    : `https://${originToValidate}`;

  if (isAllowedRedirectUrl(originUrl, requestOrigin, [...trustedOrigins, requestOrigin])) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    reason: "invalid_origin",
  };
}
