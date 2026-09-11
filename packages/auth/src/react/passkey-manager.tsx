import * as React from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "../ui";

export interface PasskeyListItem {
  credentialId: string;
  name?: string | null;
  createdAt: number;
  lastUsedAt: number;
  transports: string[];
  revoked?: boolean;
}

export interface PasskeyManagerProps {
  rpName: string;
  passkeys?: PasskeyListItem[];
  loading?: boolean;
  onRegister: (args: { name: string }) => Promise<PublicKeyCredentialCreationOptionsJSON>;
  onVerifyRegistration: (args: {
    name: string;
    response: RegistrationResponseJSON;
  }) => Promise<void>;
  onAuthenticate: () => Promise<PublicKeyCredentialRequestOptionsJSON>;
  onVerifyAuthentication: (args: { response: AuthenticationResponseJSON }) => Promise<void>;
  onRevoke: (args: { credentialId: string }) => Promise<void>;
}

export function PasskeyManager({
  rpName,
  passkeys = [],
  loading = false,
  onRegister,
  onVerifyRegistration,
  onAuthenticate,
  onVerifyAuthentication,
  onRevoke,
}: PasskeyManagerProps) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"register" | "auth" | null>(null);

  const supported = React.useMemo(() => browserSupportsWebAuthn(), []);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending("register");
    try {
      const options = await onRegister({ name });
      const response = await startRegistration({ optionsJSON: options });
      await onVerifyRegistration({ name, response });
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setPending(null);
    }
  };

  const handleAuthenticate = async () => {
    setError(null);
    setPending("auth");
    try {
      const options = await onAuthenticate();
      const response = await startAuthentication({ optionsJSON: options });
      await onVerifyAuthentication({ response });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setPending(null);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    setError(null);
    try {
      await onRevoke({ credentialId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>Manage {rpName} passkeys for this device.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!supported && (
          <p className="text-sm text-destructive">
            Your browser does not support WebAuthn passkeys.
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {supported && (
          <form onSubmit={handleRegister} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Passkey name (e.g. MacBook Touch ID)"
              className="flex-1"
              disabled={loading || pending === "register"}
            />
            <Button type="submit" disabled={loading || pending === "register" || !name.trim()}>
              Add passkey
            </Button>
          </form>
        )}

        <Button
          variant="outline"
          onClick={handleAuthenticate}
          disabled={loading || pending === "auth" || !supported}
          data-pending={pending === "auth" ? "" : undefined}
        >
          Sign in with passkey
        </Button>

        <div className="flex flex-col gap-2">
          {passkeys.length === 0 && (
            <p className="text-sm text-muted-foreground">No passkeys yet.</p>
          )}
          {passkeys.map((pk) => (
            <div
              key={pk.credentialId}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{pk.name || "Unnamed passkey"}</span>
                <span className="text-xs text-muted-foreground">
                  Added {new Date(pk.createdAt).toLocaleDateString()}
                  {pk.revoked
                    ? " · revoked"
                    : ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                </span>
                <div className="flex gap-1">
                  {pk.transports.map((t) => (
                    <Badge key={t} variant="neutral">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRevoke(pk.credentialId)}
                disabled={pk.revoked || loading}
              >
                {pk.revoked ? "Revoked" : "Revoke"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
