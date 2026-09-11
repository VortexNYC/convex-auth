import { useState } from "react";
import {
  ConvexAuthSignOutButton,
  ConvexCreateOrganization,
  ConvexEnableTwoFactorForm,
  ConvexOrganizationList,
  ConvexOrganizationMembersSurface,
  ConvexOrganizationRoleManagerSurface,
  ConvexOrganizationSwitcher,
  ConvexSessionList,
  ConvexUserProfile,
  ConvexVerifyEmailScreen,
  useAuthActions,
  useConvexAuthAppearance,
  useConvexAuthClient,
  useConvexOrganizationRefs,
  usePasskeys,
} from "@vortex-api/convex-auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@vortex-api/convex-auth/ui";

export function SignedInView() {
  const actions = useAuthActions();
  const authClient = useConvexAuthClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [message, setMessage] = useState<string | null>(null);

  const user = actions.user;
  const token = actions.token;

  if (user === null) {
    return (
      <div className="bg-background text-foreground flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading session…</p>
      </div>
    );
  }

  const handleSignOut = async () => {
    await actions.signOut();
  };

  const { theme, setTheme } = useConvexAuthAppearance();
  const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const cycleTheme = () => setTheme(nextTheme);

  const profileUser = {
    id: user.id,
    email: user.email ?? "",
    name: user.name,
    imageUrl: user.image,
    emailVerified: user.emailVerified,
  };

  return (
    <div className="bg-background text-foreground min-h-screen p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">convex-auth example</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void cycleTheme()}>
              Theme: {theme}
            </Button>
            <ConvexAuthSignOutButton signOut={() => void handleSignOut()} />
          </div>
        </div>

        {message ? (
          <div className="bg-muted text-foreground rounded-lg p-3 text-sm" role="status">
            {message}
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="passkeys">Passkeys</TabsTrigger>
            <TabsTrigger value="organizations">Workspaces</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <ConvexUserProfile
              user={profileUser}
              onUpdateProfile={async ({ name, imageUrl }) => {
                const result = await authClient.updateUser({
                  name,
                  image: imageUrl ?? undefined,
                });
                if (result.error) {
                  setMessage(result.error.message ?? "Update failed");
                } else {
                  setMessage("Profile updated.");
                }
              }}
              onManageTwoFactor={() => setActiveTab("security")}
            />
            <EmailVerificationPanel email={user.email ?? ""} onMessage={setMessage} />
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <ConvexEnableTwoFactorForm
              issuer="convex-auth"
              onEnrolled={() => setMessage("Two-factor authentication enabled.")}
            />
            <DisableTwoFactorPanel onMessage={setMessage} />
            <RegenerateBackupCodesPanel onMessage={setMessage} />
          </TabsContent>

          <TabsContent value="sessions">
            <ConvexSessionList currentSessionToken={token} />
          </TabsContent>

          <TabsContent value="passkeys">
            <PasskeysPanel userId={user.id} email={user.email ?? ""} />
          </TabsContent>

          <TabsContent value="organizations" className="space-y-4">
            <OrganizationsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PasskeysPanel({ userId, email }: { userId: string; email: string }) {
  const [name, setName] = useState("");
  const { passkeys, register, signIn, revoke, loading, error, supported } = usePasskeys({
    userId,
    identifier: email,
    rpName: "Convex Auth Demo",
    rpID: "localhost",
    origin: "http://localhost:5174",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Passkeys</CardTitle>
        <CardDescription>
          {supported ? "WebAuthn is supported." : "WebAuthn is not supported in this browser."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Passkey name"
            className="flex-1"
          />
          <Button onClick={() => void register(name)} disabled={!name || loading || !supported}>
            Register
          </Button>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button
          variant="outline"
          onClick={() => void signIn()}
          disabled={loading || !supported}
          className="w-full"
        >
          Sign in with passkey
        </Button>
        <div className="space-y-2">
          {passkeys.map((pk) => (
            <div
              key={pk.credentialId}
              className="flex items-center justify-between rounded-md border p-2"
            >
              <div className="text-sm">
                <p className="font-medium">{pk.name || "Unnamed"}</p>
                <p className="text-muted-foreground text-xs">{pk.revoked ? "Revoked" : "Active"}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void revoke(pk.credentialId)}
                disabled={pk.revoked}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationsPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const organizations = useQuery(api.organizations.listMyOrganizations) ?? [];
  const invitations = useQuery(api.organizations.listMyInvitations) ?? [];
  const activeOrg = useQuery(api.organizations.getActiveOrganization);
  const setActive = useMutation(api.organizations.setActiveOrganization);
  const create = useMutation(api.organizations.createOrganization);
  const redeem = useMutation(api.organizations.redeemInvitation);
  const refs = useConvexOrganizationRefs(api);

  const currentOrganizationId = activeOrg?._id ?? null;

  return (
    <div className="space-y-4">
      {message ? (
        <div className="bg-muted text-foreground rounded-lg p-3 text-sm" role="status">
          {message}
        </div>
      ) : null}

      <ConvexOrganizationSwitcher
        organizations={organizations}
        currentOrganizationId={currentOrganizationId}
        currentOrganization={activeOrg ?? null}
        onSelectOrganization={async (id) => {
          await setActive({ organizationId: id });
          setMessage("Active workspace updated.");
        }}
        onInPlaceCreateOrganization={async (name) => {
          try {
            await create({ name });
            setMessage("Workspace created.");
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Could not create workspace");
          }
        }}
      />

      <ConvexOrganizationList
        organizations={organizations}
        invitations={invitations}
        currentOrganizationId={currentOrganizationId}
        onSelectOrganization={async (id) => {
          await setActive({ organizationId: id });
          setMessage("Active workspace updated.");
        }}
        onAcceptInvitation={async (id) => {
          try {
            await redeem({ invitationId: id });
            setMessage("Invitation accepted.");
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Could not accept invitation");
          }
        }}
        onCreateOrganization={() => setCreating(true)}
      />

      {creating ? (
        <Card>
          <CardContent className="pt-6">
            <ConvexCreateOrganization
              onCreate={async (input) => {
                try {
                  await create(input);
                  setCreating(false);
                  setMessage("Workspace created.");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "Could not create workspace");
                }
              }}
              onCancel={() => setCreating(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      {currentOrganizationId ? (
        <>
          <ConvexOrganizationMembersSurface
            organizationId={currentOrganizationId}
            roleOptions={["owner", "admin", "manager", "member", "viewer"]}
            refs={refs.members}
          />
          <ConvexOrganizationRoleManagerSurface canCreateRoles refs={refs.roles} />
        </>
      ) : null}
    </div>
  );
}

function EmailVerificationPanel({
  email,
  onMessage,
}: {
  email: string;
  onMessage: (msg: string) => void;
}) {
  const authClient = useConvexAuthClient();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const send = async () => {
    setStatus("Sending…");
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: window.location.origin,
    });
    if (
      result.error ||
      typeof result.data !== "object" ||
      result.data === null ||
      !("emailId" in result.data)
    ) {
      setStatus(result.error?.message ?? "Could not send verification email");
      return;
    }
    const t = (result.data as { emailId?: string }).emailId ?? "";
    setToken(t);
    setStatus("Verification token issued.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email verification</CardTitle>
        <CardDescription>Send a verification email and confirm the token.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => void send()} className="w-full sm:w-auto">
            Send verification token
          </Button>
          {status ? <p className="text-muted-foreground text-sm">{status}</p> : null}
        </div>
        {token ? (
          <>
            <Separator />
            <div className="bg-muted rounded p-2 break-all font-mono text-xs">{token}</div>
            <ConvexVerifyEmailScreen
              token={token}
              userEmail={email}
              resendCallbackUrl={window.location.origin}
              onVerified={() => onMessage("Email verified.")}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DisableTwoFactorPanel({ onMessage }: { onMessage: (msg: string) => void }) {
  const authClient = useConvexAuthClient();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const result = await authClient.twoFactor.disable({ password });
    setIsLoading(false);
    if (result.error) {
      onMessage(result.error.message ?? "Could not disable 2FA");
    } else {
      onMessage("Two-factor authentication disabled.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Disable two-factor authentication</CardTitle>
        <CardDescription>Enter your password to disable 2FA.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="disable-2fa-password">Password</Label>
            <Input
              id="disable-2fa-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={isLoading} className="w-full">
            Disable 2FA
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RegenerateBackupCodesPanel({ onMessage }: { onMessage: (msg: string) => void }) {
  const authClient = useConvexAuthClient();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const result = await authClient.twoFactor.generateBackupCodes({ password });
    setIsLoading(false);
    if (result.error || !result.data?.backupCodes) {
      onMessage(result.error?.message ?? "Could not generate backup codes");
      return;
    }
    setCodes(result.data.backupCodes);
    onMessage("Backup codes regenerated.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regenerate backup codes</CardTitle>
        <CardDescription>Enter your password to generate new backup codes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="regenerate-backup-password">Password</Label>
            <Input
              id="regenerate-backup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={isLoading} className="w-full">
            Regenerate
          </Button>
        </form>
        {codes ? (
          <>
            <Separator />
            <div className="bg-muted rounded p-2 font-mono text-xs">
              {codes.map((code) => (
                <div key={code}>{code}</div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
