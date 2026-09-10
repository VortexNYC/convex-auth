import * as React from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { useMutation, useQuery } from "convex/react";
import type { GenericId } from "convex/values";

import { api } from "../component/_generated/api.js";
import type { PasskeyListItem } from "./passkey-manager.js";

export interface UsePasskeysArgs {
  userId: GenericId<"users">;
  identifier: string;
  rpName: string;
  rpID: string;
  origin: string;
}

export function usePasskeys(args: UsePasskeysArgs) {
  const generateRegistrationOptions = useMutation(api.passkeys.generatePasskeyRegistrationOptions);
  const verifyRegistration = useMutation(api.passkeys.verifyPasskeyRegistration);
  const generateAuthenticationOptions = useMutation(
    api.passkeys.generatePasskeyAuthenticationOptions,
  );
  const verifyAuthentication = useMutation(api.passkeys.verifyPasskeyAuthentication);
  const revokePasskey = useMutation(api.passkeys.revokePasskey);
  const passkeys = useQuery(api.passkeys.listPasskeys, { userId: args.userId });

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
