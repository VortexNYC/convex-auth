import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ConvexCreateOrganization,
  ConvexEnableTwoFactorForm,
  ConvexOrganizationList,
  ConvexSessionList,
  ConvexUserProfile,
  ConvexVerifyEmailScreen,
  useAuthActions,
  useConvexAuthClient,
} from "convex-auth/react";
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
} from "convex-auth/ui";
import { api } from "../convex/_generated/api.js";
import type { ConvexOrgListOrganization } from "convex-auth/react";

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

  const profileUser = {
    id: user.id,
    email: user.email ?? "",
    name: user.name,
    imageUrl: user.image,
    emailVerified: user.emailVerified,
  };

  return (
    <div className="bg-background text-foreground min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">convex-auth demo</h1>
            <p className="text-muted-foreground text-sm">{user.email}</p>
          </div>
          <Button variant="outline" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
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
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <ConvexUserProfile
              user={profileUser}
              onUpdateProfile={async ({ name, imageUrl }) => {
                const result = await authClient.updateUser({ name, image: imageUrl ?? undefined });
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

          <TabsContent value="organizations" className="space-y-4">
            <OrganizationPanel userId={user.id} onMessage={setMessage} />
          </TabsContent>
        </Tabs>
      </div>
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
      onMessage(result.error.message ?? "Could not disable two-factor authentication");
      return;
    }
    onMessage("Two-factor authentication disabled.");
    setPassword("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Disable two-factor authentication</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="disable-2fa-password">Password</Label>
            <Input
              id="disable-2fa-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
          </div>
          <Button type="submit" disabled={isLoading} variant="destructive">
            {isLoading ? "Disabling…" : "Disable 2FA"}
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
      onMessage(result.error?.message ?? "Could not regenerate backup codes");
      return;
    }
    setCodes(result.data.backupCodes);
    onMessage("Backup codes regenerated. Save these — they won't be shown again.");
    setPassword("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regenerate backup codes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="regenerate-password">Password</Label>
            <Input
              id="regenerate-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
          </div>
          <Button type="submit" disabled={isLoading} variant="outline">
            {isLoading ? "Generating…" : "Regenerate"}
          </Button>
        </form>
        {codes ? (
          <ul className="bg-muted grid grid-cols-2 gap-2 rounded p-3 font-mono text-xs">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OrganizationPanel({
  userId,
  onMessage,
}: {
  userId: string;
  onMessage: (msg: string) => void;
}) {
  const organizations = useQuery(api.organizations.list, { userId });
  const create = useMutation(api.organizations.create);
  const [showCreate, setShowCreate] = useState(false);

  const orgList: ConvexOrgListOrganization[] | undefined = organizations?.map((org) => ({
    _id: org._id,
    name: org.name,
    slug: org.slug,
  }));

  return (
    <div className="space-y-4">
      <ConvexOrganizationList
        organizations={orgList ?? []}
        isLoading={organizations === undefined}
        onSelectOrganization={() => {}}
        onCreateOrganization={() => setShowCreate(true)}
      />
      {showCreate ? (
        <ConvexCreateOrganization
          onCreate={async ({ name, slug }) => {
            const result = await create({ userId, name, slug });
            if (result === null) {
              onMessage("Could not create organization.");
              return;
            }
            onMessage("Organization created.");
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}
    </div>
  );
}
