import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ConvexApiKeyCreateForm,
  ConvexApiKeyList,
  ConvexCreateOrganization,
  ConvexEnableTwoFactorForm,
  ConvexOrganizationList,
  ConvexSecurityAuditList,
  ConvexSessionList,
  ConvexUserProfile,
  ConvexVerifyEmailScreen,
  ConvexWebhookCreateForm,
  ConvexWebhookDeliveryList,
  ConvexWebhookEndpointList,
  getConvexApiKeyExpiresAt,
  parseConvexApiKeyAllowedIpRanges,
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
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

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
            <TabsTrigger value="apiKeys">API keys</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="securityAudit">Audit</TabsTrigger>
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
            <OrganizationPanel
              userId={user.id}
              onMessage={setMessage}
              selectedOrganizationId={selectedOrganizationId}
              onSelectOrganization={setSelectedOrganizationId}
            />
          </TabsContent>

          <TabsContent value="apiKeys" className="space-y-4">
            <ApiKeysPanel
              userId={user.id}
              organizationId={selectedOrganizationId}
              onMessage={setMessage}
            />
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <WebhooksPanel userId={user.id} organizationId={selectedOrganizationId} />
          </TabsContent>

          <TabsContent value="securityAudit" className="space-y-4">
            <SecurityAuditPanel organizationId={selectedOrganizationId} />
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
  selectedOrganizationId,
  onSelectOrganization,
}: {
  userId: string;
  onMessage: (msg: string) => void;
  selectedOrganizationId: string | null;
  onSelectOrganization: (organizationId: string) => void;
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
        currentOrganizationId={selectedOrganizationId}
        isLoading={organizations === undefined}
        onSelectOrganization={onSelectOrganization}
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

const DEMO_API_KEY_SCOPES = ["data:read", "data:write"] as const;
const DEMO_WEBHOOK_EVENTS = ["user.created", "user.updated", "test.event"] as const;

function ApiKeysPanel({
  userId,
  organizationId,
  onMessage,
}: {
  userId: string;
  organizationId: string | null;
  onMessage: (msg: string) => void;
}) {
  const apiKeys = useQuery(api.apiKeys.list, organizationId ? { organizationId } : "skip");
  const create = useMutation(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const rotate = useMutation(api.apiKeys.rotate);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [state, setState] = useState({
    name: "",
    scopes: [] as string[],
    ipAllowlist: "",
    expiresInDays: "none",
  });

  if (organizationId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>
            Select an organization in the Organizations tab to manage API keys.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const listItems = apiKeys?.map((key) => ({
    _id: key._id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    allowedIpRanges: key.allowedIpRanges ?? [],
    status: key.status,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    lastUsedIp: key.lastUsedIp,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    createdBy: null,
  }));

  const handleCreate = async () => {
    setCreating(true);
    setNewKey(null);
    try {
      const result = await create({
        organizationId,
        userId,
        name: state.name,
        scopes: state.scopes,
        allowedIpRanges: parseConvexApiKeyAllowedIpRanges(state.ipAllowlist),
        expiresAt: getConvexApiKeyExpiresAt(state.expiresInDays),
      });

      setNewKey(result.apiKey);
      onMessage("API key created. Save it now — it will not be shown again.");
      setState({ name: "", scopes: [], ipAllowlist: "", expiresInDays: "none" });
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (apiKeyId: string) => {
    try {
      await revoke({ apiKeyId, organizationId });
      onMessage("API key revoked.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not revoke API key");
    }
  };

  const handleRotate = async (apiKeyId: string) => {
    setNewKey(null);
    try {
      const result = await rotate({ apiKeyId, organizationId, userId });
      setNewKey(result.apiKey);
      onMessage("API key rotated. Save the new key — it will not be shown again.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not rotate API key");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create API key</CardTitle>
          <CardDescription>Issue a key for the selected organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConvexApiKeyCreateForm
            apiEnabled={true}
            creating={creating}
            scopeOptions={DEMO_API_KEY_SCOPES}
            state={state}
            onNameChange={(name) => setState((s) => ({ ...s, name }))}
            onScopesChange={(scopes) => setState((s) => ({ ...s, scopes }))}
            onIpAllowlistChange={(ipAllowlist) => setState((s) => ({ ...s, ipAllowlist }))}
            onExpiresInDaysChange={(expiresInDays) => setState((s) => ({ ...s, expiresInDays }))}
            onSubmit={handleCreate}
          />
          {newKey ? (
            <div className="bg-muted mt-4 rounded p-2 break-all font-mono text-xs" role="status">
              {newKey}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active API keys</CardTitle>
        </CardHeader>
        <CardContent>
          <ConvexApiKeyList
            apiKeys={listItems}
            copy={{ emptyMessage: "No API keys for this organization." }}
            onRevoke={handleRevoke}
            onRotate={handleRotate}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function WebhooksPanel({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string | null;
}) {
  const [form, setForm] = useState({ url: "", description: "", events: [] as string[] });
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sendingTestEndpointId, setSendingTestEndpointId] = useState<string | null>(null);

  const endpointsArgs = organizationId ? { organizationId } : ("skip" as const);
  const deliveriesArgs = organizationId ? { organizationId } : ("skip" as const);

  const endpoints = useQuery(api.webhooks.listEndpoints, endpointsArgs);
  const deliveries = useQuery(api.webhooks.listRecentDeliveries, deliveriesArgs);

  const createEndpointMutation = useMutation(api.webhooks.createEndpoint);
  const updateEndpointMutation = useMutation(api.webhooks.updateEndpoint);
  const archiveEndpointMutation = useMutation(api.webhooks.archiveEndpoint);
  const disableEndpointMutation = useMutation(api.webhooks.disableEndpoint);
  const removeEndpointMutation = useMutation(api.webhooks.removeEndpoint);
  const rotateEndpointSecretMutation = useMutation(api.webhooks.rotateEndpointSecret);
  const sendTestMutation = useMutation(api.webhooks.sendTest);

  if (organizationId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhooks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Select an organization in the Organizations tab to manage webhooks.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleCreate = async () => {
    setCreating(true);
    setSecret(null);
    setStatusMessage(null);
    try {
      const result = await createEndpointMutation({
        organizationId,
        userId,
        url: form.url,
        description: form.description || undefined,
        events: form.events,
      });
      if (
        typeof result === "object" &&
        result !== null &&
        "secret" in result &&
        typeof result.secret === "string"
      ) {
        setSecret(result.secret);
      }
      setForm({ url: "", description: "", events: [] });
    } catch (error) {
      setStatusMessage(
        `Could not create webhook endpoint: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (
    endpointId: string,
    values: { url: string; description?: string; events: string[] },
  ) => {
    await updateEndpointMutation({
      organizationId,
      endpointId,
      url: values.url,
      description: values.description,
      events: values.events,
    });
  };

  const handleRotate = async (endpointId: string) => {
    setSecret(null);
    setStatusMessage(null);
    try {
      const result = await rotateEndpointSecretMutation({ organizationId, endpointId });
      if (
        typeof result === "object" &&
        result !== null &&
        "secret" in result &&
        typeof result.secret === "string"
      ) {
        setSecret(result.secret);
      }
    } catch (error) {
      setStatusMessage(
        `Could not rotate secret: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  };

  const handleSendTest = async (endpointId: string) => {
    setSendingTestEndpointId(endpointId);
    try {
      await sendTestMutation({ organizationId, endpointId });
    } catch (error) {
      setStatusMessage(
        `Could not send test event: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setSendingTestEndpointId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhooks</CardTitle>
          <CardDescription>
            Create endpoints, rotate secrets, send test events, and view deliveries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {secret !== null && (
            <div className="bg-muted rounded p-3 space-y-2" role="status">
              <p className="text-sm font-medium">Endpoint secret</p>
              <code className="break-all text-xs">{secret}</code>
              <p className="text-xs text-muted-foreground">
                Save it now — it will not be shown again.
              </p>
            </div>
          )}
          {statusMessage !== null && <p className="text-destructive text-sm">{statusMessage}</p>}
          <ConvexWebhookCreateForm
            enabled={true}
            eventOptions={DEMO_WEBHOOK_EVENTS}
            creating={creating}
            state={form}
            onUrlChange={(url) => setForm((f) => ({ ...f, url }))}
            onDescriptionChange={(description) => setForm((f) => ({ ...f, description }))}
            onEventsChange={(events) => setForm((f) => ({ ...f, events }))}
            onSubmit={handleCreate}
          />
          <ConvexWebhookEndpointList
            copy={{ emptyMessage: "No webhook endpoints configured yet." }}
            endpoints={endpoints}
            eventOptions={DEMO_WEBHOOK_EVENTS}
            sendingTestEndpointId={sendingTestEndpointId}
            onArchive={(endpointId) => archiveEndpointMutation({ organizationId, endpointId })}
            onDelete={(endpointId) => removeEndpointMutation({ organizationId, endpointId })}
            onDisable={(endpointId) => disableEndpointMutation({ organizationId, endpointId })}
            onRotateSecret={handleRotate}
            onSave={handleSave}
            onSendTest={handleSendTest}
          />
          <ConvexWebhookDeliveryList
            copy={{ emptyMessage: "No webhook deliveries yet." }}
            deliveries={deliveries}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityAuditPanel({ organizationId }: { organizationId: string | null }) {
  const args = organizationId ? { organizationId, limit: 50 } : ("skip" as const);
  const logs = useQuery(api.securityAudit.list, args);

  if (organizationId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security audit</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Select an organization in the Organizations tab to view audit events.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Security audit</CardTitle>
        <CardDescription>
          Recent authorization and security events for this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConvexSecurityAuditList
          copy={{ emptyMessage: "No security audit events yet." }}
          logs={logs}
        />
      </CardContent>
    </Card>
  );
}
