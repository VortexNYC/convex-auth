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

import { ConvexAuthContext } from "./ConvexAuthProvider.js";
import type { PasskeyListItem } from "./passkey-manager.js";

export interface UsePasskeysArgs {
  userId?: string;
  identifier?: string;
  rpName: string;
  rpID: string;
  origin: string;
}

type RegistrationOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];

export function usePasskeys(args: UsePasskeysArgs) {
  const { userId, identifier, rpName, rpID, origin } = args;
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
    !ctx.revokePasskey
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
    setSupported(browserSupportsWebAuthn());
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
                rpName,
                rpID,
              })
            : Promise.resolve(null);
        const [regOpts, authOpts] = await Promise.all([
          regPromise,
          generateAuthenticationOptions({
            userId,
            rpID,
          }),
        ]);
        if (!cancelled) {
          setRegistrationOptions(regOpts);
          setAuthenticationOptions(authOpts);
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
  }, [
    userId,
    identifier,
    rpName,
    rpID,
    generateRegistrationOptions,
    generateAuthenticationOptions,
  ]);

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
        const response = await startRegistration({ optionsJSON: registrationOptions });
        await verifyRegistration({
          userId,
          identifier,
          challenge: registrationOptions.challenge as string,
          response,
          rpID,
          origin,
          name,
        });
        // Refresh registration options so another passkey can be registered.
        setRegistrationOptions(
          await generateRegistrationOptions({
            userId,
            identifier,
            displayName: identifier,
            rpName,
            rpID,
          }),
        );
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
      rpID,
      origin,
      rpName,
      generateRegistrationOptions,
    ],
  );

  const signIn = React.useCallback(
    async (_credentialId?: string) => {
      if (!authenticationOptions) {
        throw new Error("Passkey authentication options are not ready");
      }
      setLoading(true);
      setError(null);
      try {
        const response = await startAuthentication({ optionsJSON: authenticationOptions });
        const result = await verifyAuthentication({
          challenge: authenticationOptions.challenge as string,
          response,
          rpID,
          origin,
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
    },
    [authenticationOptions, verifyAuthentication, rpID, origin, ctx],
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

  return {
    passkeys: (passkeys ?? []) as PasskeyListItem[],
    register,
    signIn,
    revoke,
    loading,
    error,
    supported,
  };
}

export type { AuthenticationResponseJSON, RegistrationResponseJSON };
