import type { NativeAuthActions } from "../react/ConvexAuthProvider.js";

/**
 * `api.auth` is a lazy Proxy whose FunctionReferences keep their name under a
 * Symbol key — neither survives React's server→client serialization (the
 * proxy has no enumerable props, so it arrives as `{}`). The server provider
 * therefore sends action *names* across the boundary and the client rebuilds
 * the references via `Symbol.for("functionName")` — global, so a rebuilt ref
 * reads identically to one the `api` proxy fabricates.
 *
 * This module is imported at runtime only by the server half; the client half
 * keeps its own (entry-iterating) deserializer in `client.tsx`. Sharing a
 * runtime module across the boundary would let the bundler merge it into a
 * directed chunk, turning a plain helper call into a cross-boundary function
 * reference. `SerializedAuthActions` itself is type-only and safe to import
 * from either side.
 */
export type SerializedAuthActions = {
  [K in keyof NativeAuthActions]?: string;
};

const AUTH_ACTION_KEYS = [
  "signUp",
  "signIn",
  "signOut",
  "sendEmailVerification",
  "verifyEmail",
  "sendPasswordReset",
  "resetPassword",
  "verifyPassword",
  "updateSession",
  "verifySession",
  "signInMagicLink",
  "signInWithRedirect",
  "callback",
  "sendVerificationOtp",
  "verifyEmailOtp",
  "updateUser",
  "twoFactorEnable",
  "twoFactorVerifyTOTP",
  "twoFactorVerifyBackupCode",
  "twoFactorDisable",
  "twoFactorGenerateBackupCodes",
  "listSessions",
  "revokeSession",
  "revokeOtherSessions",
  "signInAnonymous",
  "linkAnonymousAccount",
  "getPasskeyRegistrationOptions",
  "verifyPasskeyRegistration",
  "getPasskeyAuthenticationOptions",
  "verifyPasskeyAuthentication",
  "listPasskeys",
  "revokePasskey",
  "renamePasskey",
] as const satisfies readonly (keyof NativeAuthActions)[];

const functionNameSymbol = Symbol.for("functionName");

function referenceName(ref: unknown): string | undefined {
  const name = (ref as { [key: symbol]: unknown } | null)?.[
    functionNameSymbol
  ];
  return typeof name === "string" ? name : undefined;
}

export function serializeAuthActions(
  actions: NativeAuthActions,
): SerializedAuthActions {
  const serialized: SerializedAuthActions = {};
  for (const key of AUTH_ACTION_KEYS) {
    const name = referenceName(actions[key]);
    if (name !== undefined) {
      serialized[key] = name;
    }
  }
  return serialized;
}
