import { ConvexError } from "convex/values";

/**
 * Canonical auth-error shape thrown by the package's adapter glue.
 * Consumers SHOULD use this rather than throwing bare strings — observability,
 * client-side branching, and i18n all depend on the structured payload.
 *
 * `code` is the HTTP-flavored category. `authzCode` is the fine-grained
 * reason from `AuthorizationFailureCode` (re-uses the package's existing
 * decision codes) plus a few glue-specific ones for missing anchors.
 *
 * Throw from one entry point so every consumer surfaces the same shape:
 *
 *   throwAuthError("UNAUTHORIZED", "AUTHENTICATION_REQUIRED");
 *   throwAuthError("FORBIDDEN", "PERMISSION_REQUIRED", "missing users:roles");
 */

export type AuthErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND";

export type AuthErrorAuthzCode =
  | "AUTHENTICATION_REQUIRED"
  | "SESSION_REQUIRED"
  | "ORGANIZATION_REQUIRED"
  | "PERMISSION_REQUIRED"
  | "PRINCIPAL_RESTRICTED"
  | "USER_MISSING"
  | "MEMBERSHIP_MISSING"
  | "ANCHOR_MISSING";

export interface AuthErrorPayload {
  code: AuthErrorCode;
  authzCode?: AuthErrorAuthzCode;
  message: string;
}

/**
 * Throw a canonical ConvexError. Always throws — return type is `never` so
 * callers can use it in expression position without TypeScript thinking the
 * code below the throw is reachable.
 */
export function throwAuthError(
  code: AuthErrorCode,
  authzCode?: AuthErrorAuthzCode,
  message?: string,
): never {
  const resolvedMessage = message ?? defaultMessage(code, authzCode);
  /** Inline literal so TypeScript infers a Value-compatible shape for
   * ConvexError. Named-interface payloads lose this inference. */
  if (authzCode !== undefined) {
    throw new ConvexError({
      code,
      authzCode,
      message: resolvedMessage,
    });
  }
  throw new ConvexError({
    code,
    message: resolvedMessage,
  });
}

function defaultMessage(code: AuthErrorCode, authzCode?: AuthErrorAuthzCode): string {
  if (authzCode !== undefined) {
    switch (authzCode) {
      case "AUTHENTICATION_REQUIRED":
        return "Authentication required";
      case "SESSION_REQUIRED":
        return "Active session required";
      case "ORGANIZATION_REQUIRED":
        return "Organization context required";
      case "PERMISSION_REQUIRED":
        return "Permission required";
      case "PRINCIPAL_RESTRICTED":
        return "Caller is restricted";
      case "USER_MISSING":
        return "User not found";
      case "MEMBERSHIP_MISSING":
        return "Not a member of this organization";
      case "ANCHOR_MISSING":
        return "Organization anchor missing";
    }
  }
  switch (code) {
    case "UNAUTHORIZED":
      return "Authentication required";
    case "FORBIDDEN":
      return "Forbidden";
    case "NOT_FOUND":
      return "Not found";
    default:
      throw new TypeError("Unsupported auth error code");
  }
}

/**
 * Type guard. The ConvexError data shape uses unknown — use this to narrow
 * caught errors in tests and HTTP boundaries.
 */
export function isAuthErrorPayload(value: unknown): value is AuthErrorPayload {
  if (value === null || typeof value !== "object") return false;
  const v = value as { code?: unknown; message?: unknown };
  return (
    (v.code === "UNAUTHORIZED" || v.code === "FORBIDDEN" || v.code === "NOT_FOUND") &&
    typeof v.message === "string"
  );
}
