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
      return validateOriginOrReferer(request, trustedOrigins, { requireWhenNoCookie: true });
    }

    return validateOriginOrReferer(request, trustedOrigins, { requireWhenNoCookie: false });
  }

  if (hasCookie) {
    return validateOriginOrReferer(request, trustedOrigins, { requireWhenNoCookie: true });
  }

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
