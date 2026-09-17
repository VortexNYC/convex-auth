import * as React from "react";
import { create, get, isSupported } from "react-native-passkeys";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useContext } from "react";

import { ConvexAuthContext } from "../react/ConvexAuthProvider.js";
import type { PasskeyListItem } from "../react/passkey-manager.js";

export interface UseNativePasskeysArgs {
  userId?: string;
  identifier?: string;
}

type RegistrationOptions = Parameters<typeof create>[0];
type AuthenticationOptions = Parameters<typeof get>[0];

// iOS surfaces user cancellation as a thrown error (ASAuthorization
// errorDomain 1001 / "cancelled"), Android Credential Manager returns null —
// and may even yield a credential object with no response. Normalize all of
// those to null so callers get one "cancelled" path.
function isCancellationError(err: unknown): boolean {
  return err instanceof Error && /cancel/i.test(`${err.name} ${err.message}`);
}

// Native ceremony results can't cross the Convex wire verbatim:
// react-native-passkeys decorates the attestation response with a
// `getPublicKey()` method (functions aren't serializable), and both platforms
// return optional fields as explicit `null` — which fails `v.optional()`
// validators server-side. Drop functions and null/undefined keys.
function toSerializableCredential<T extends { response: object }>(credential: T): T {
  const clean = <O extends object>(obj: O) =>
    Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v != null && typeof v !== "function"),
    ) as O;
  return { ...clean(credential), response: clean(credential.response) };
}

async function createCredential(options: RegistrationOptions) {
  try {
    const response = await create(options);
    return response && response.response ? response : null;
  } catch (err) {
    if (isCancellationError(err)) return null;
    throw err;
  }
}

async function getCredential(options: AuthenticationOptions) {
  try {
    const response = await get(options);
    return response && response.response ? response : null;
  } catch (err) {
    if (isCancellationError(err)) return null;
    throw err;
  }
}

/**
 * React Native / Expo passkey hook backed by `react-native-passkeys`
 * (ASAuthorizationController on iOS, Credential Manager on Android).
 *
 * Server verification is identical to web — the native ceremonies return
 * SimpleWebAuthn-compatible JSON, and `rpID`/`origin` come from the
 * `passkey` block in `convexAuth` (include every platform origin there: the
 * web origin plus `android:apk-key-hash:<hash>` entries).
 *
 * `react-native-passkeys` is an optional peer dependency — this module is only
 * reachable through the `@vortex-api/convex-auth/react-native/passkeys`
 * subpath, so apps that don't use passkeys never bundle it.
 */
export function usePasskeys(args: UseNativePasskeysArgs) {
  const { userId, identifier } = args;
  const ctx = useContext(ConvexAuthContext);
  if (ctx === null) {
    throw new Error("usePasskeys must be used within a ConvexAuthProvider");
  }
  if (
    !ctx.getPasskeyRegistrationOptions ||
    !ctx.verifyPasskeyRegistration ||
    !ctx.getPasskeyAuthenticationOptions ||
    !ctx.verifyPasskeyAuthentication ||
    !ctx.listPasskeys ||
    !ctx.revokePasskey ||
    !ctx.renamePasskey
  ) {
    throw new Error("Passkeys are not configured in convexAuth.");
  }
  const generateRegistrationOptions = useAction(
    ctx.getPasskeyRegistrationOptions as unknown as FunctionReference<"action">,
  );
  const verifyRegistration = useAction(
    ctx.verifyPasskeyRegistration as unknown as FunctionReference<"action">,
  );
  const generateAuthenticationOptions = useAction(
    ctx.getPasskeyAuthenticationOptions as unknown as FunctionReference<"action">,
  );
  const verifyAuthentication = useAction(
    ctx.verifyPasskeyAuthentication as unknown as FunctionReference<"action">,
  );
  const revokePasskey = useMutation(ctx.revokePasskey as unknown as FunctionReference<"mutation">);
  const renamePasskey = useMutation(ctx.renamePasskey as unknown as FunctionReference<"mutation">);
  const passkeys = useQuery(ctx.listPasskeys as unknown as FunctionReference<"query">, {
    userId,
  });

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState(false);
  const [registrationOptions, setRegistrationOptions] = React.useState<RegistrationOptions | null>(
    null,
  );
  const [authenticationOptions, setAuthenticationOptions] =
    React.useState<AuthenticationOptions | null>(null);

  React.useEffect(() => {
    setSupported(isSupported());
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const regPromise =
          userId && identifier
            ? generateRegistrationOptions({
                userId,
                identifier,
                displayName: identifier,
              })
            : Promise.resolve(null);
        const [regOpts, authOpts] = await Promise.all([
          regPromise,
          generateAuthenticationOptions({
            userId,
          }),
        ]);
        if (!cancelled) {
          setRegistrationOptions(regOpts as RegistrationOptions | null);
          setAuthenticationOptions(authOpts as AuthenticationOptions | null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load passkey options");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, identifier, generateRegistrationOptions, generateAuthenticationOptions]);

  const register = React.useCallback(
    async (name: string) => {
      if (!registrationOptions) {
        throw new Error("Passkey registration options are not ready");
      }
      if (!userId || !identifier) {
        throw new Error("Passkey registration requires a user and identifier");
      }
      setLoading(true);
      setError(null);
      try {
        const response = await createCredential(registrationOptions);
        if (response === null) {
          throw new Error("Passkey registration was cancelled");
        }
        await verifyRegistration({
          userId,
          identifier,
          challenge: registrationOptions.challenge as string,
          response: toSerializableCredential(response),
          name,
        });
        // Refresh both option sets — a new challenge for the next ceremony and
        // fresh allowCredentials containing the just-registered credential.
        const [regOpts, authOpts] = await Promise.all([
          generateRegistrationOptions({
            userId,
            identifier,
            displayName: identifier,
          }),
          generateAuthenticationOptions({ userId }),
        ]);
        setRegistrationOptions(regOpts as RegistrationOptions | null);
        setAuthenticationOptions(authOpts as AuthenticationOptions | null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Registration failed";
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [
      registrationOptions,
      verifyRegistration,
      userId,
      identifier,
      generateRegistrationOptions,
      generateAuthenticationOptions,
    ],
  );

  const signIn = React.useCallback(async () => {
    if (!authenticationOptions) {
      throw new Error("Passkey authentication options are not ready");
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getCredential(authenticationOptions);
      if (response === null) {
        throw new Error("Passkey authentication was cancelled");
      }
      const result = await verifyAuthentication({
        challenge: authenticationOptions.challenge as string,
        response: toSerializableCredential(response),
      });
      ctx.setToken(result.token);
      ctx.setRefreshToken(result.refreshToken);
      ctx.setSessionId(result.sessionId);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [authenticationOptions, verifyAuthentication, ctx]);

  const revoke = React.useCallback(
    async (credentialId: string) => {
      setError(null);
      try {
        await revokePasskey({ credentialId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Revoke failed";
        setError(message);
        throw new Error(message);
      }
    },
    [revokePasskey],
  );

  const rename = React.useCallback(
    async (credentialId: string, name: string) => {
      setError(null);
      try {
        await renamePasskey({ credentialId, name });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Rename failed";
        setError(message);
        throw new Error(message);
      }
    },
    [renamePasskey],
  );

  return {
    passkeys: (passkeys ?? []) as PasskeyListItem[],
    register,
    signIn,
    revoke,
    rename,
    loading,
    error,
    supported,
  };
}
