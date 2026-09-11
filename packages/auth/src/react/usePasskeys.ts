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
  userId: string;
  identifier: string;
  rpName: string;
  rpID: string;
  origin: string;
}

export function usePasskeys(args: UsePasskeysArgs) {
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
    userId: args.userId,
  });

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState(false);

  React.useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  const register = React.useCallback(
    async (name: string) => {
      setLoading(true);
      setError(null);
      try {
        const options = await generateRegistrationOptions({
          userId: args.userId,
          identifier: args.identifier,
          displayName: name,
          rpName: args.rpName,
          rpID: args.rpID,
        });
        const response = await startRegistration({ optionsJSON: options });
        await verifyRegistration({
          userId: args.userId,
          identifier: args.identifier,
          challenge: options.challenge,
          response,
          rpID: args.rpID,
          origin: args.origin,
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
    [args, generateRegistrationOptions, verifyRegistration],
  );

  const signIn = React.useCallback(
    async (credentialId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const options = await generateAuthenticationOptions({
          userId: args.userId,
          credentialId,
          rpID: args.rpID,
        });
        const response = await startAuthentication({ optionsJSON: options });
        return await verifyAuthentication({
          challenge: options.challenge,
          response,
          rpID: args.rpID,
          origin: args.origin,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Authentication failed";
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [args, generateAuthenticationOptions, verifyAuthentication],
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
