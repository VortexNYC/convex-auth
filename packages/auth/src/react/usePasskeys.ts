import * as React from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useContext } from "react";

import { callAuthProxy, ConvexAuthContext } from "./ConvexAuthProvider.js";
import type { PasskeyListItem } from "./passkey-manager.js";

export interface UsePasskeysArgs {
  userId?: string;
  identifier?: string;
  /**
   * Enable WebAuthn conditional UI (browser autofill on an
   * `autocomplete="username webauthn"` input). When true, `signIn` uses
   * conditional mediation instead of a modal prompt.
   */
  autofill?: boolean;
}

export function usePasskeys(args: UsePasskeysArgs) {
  const { userId, identifier, autofill } = args;
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

  React.useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  const register = React.useCallback(
    async (name: string) => {
      if (!userId || !identifier) {
        throw new Error("Passkey registration requires a user and identifier");
      }
      setLoading(true);
      setError(null);
      try {
        const options = await generateRegistrationOptions({
          userId,
          identifier,
          displayName: identifier,
        });
        const response = await startRegistration({ optionsJSON: options });
        await verifyRegistration({
          userId,
          identifier,
          challenge: options.challenge as string,
          response,
          name,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Registration failed";
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [generateRegistrationOptions, verifyRegistration, userId, identifier],
  );

  const signIn = React.useCallback(
    async (credentialId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const options = await generateAuthenticationOptions({ userId, credentialId });
        const response = await startAuthentication({
          optionsJSON: options,
          useBrowserAutofill: autofill ?? false,
        });
        const cookieMode = ctx.storageMode === "cookies";
        const verifyArgs = {
          challenge: options.challenge as string,
          response,
        };
        /* Cookie mode routes the mint through the adapter proxy so the
         * session lands in HttpOnly cookies — the client cannot set them
         * itself. */
        const result = cookieMode
          ? ((await callAuthProxy(
              ctx.apiRoute ?? "/api/auth",
              "verifyPasskeyAuthentication",
              verifyArgs,
            )) as {
              token?: string;
              refreshToken?: string;
              sessionId?: string;
              twoFactorRedirect?: boolean;
              twoFactorChallengeToken?: string;
            })
          : await verifyAuthentication(verifyArgs);
        if (result.token && (cookieMode || (result.refreshToken && result.sessionId))) {
          ctx.setToken(result.token);
          if (!cookieMode && result.refreshToken) {
            ctx.setRefreshToken(result.refreshToken);
          }
          if (result.sessionId) {
            ctx.setSessionId(result.sessionId);
          }
        } else if (result.twoFactorRedirect === true) {
          ctx.setTwoFactorChallengeToken(result.twoFactorChallengeToken ?? null);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Authentication failed";
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [generateAuthenticationOptions, verifyAuthentication, ctx, autofill, userId],
  );

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

export type { AuthenticationResponseJSON, RegistrationResponseJSON };
