import { useCallback, useMemo, useState } from "react";

import { useConvexAuthUpdateProfile } from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { ConvexEnableTwoFactorForm } from "./convex-enable-two-factor-form";
import { ConvexSessionList } from "./convex-session-list";
import { cn } from "./lib/ui";
import {
  ConvexOrganizationList,
  type ConvexOrgListInvitation,
  type ConvexOrgListOrganization,
} from "./organization-list";
import { ConvexUserProfile, type ConvexUserProfileUser } from "./user-profile";

export type ConvexAdminPortalTab = "profile" | "sessions" | "security" | "workspace";

export type ConvexAdminPortalClassNames = {
  root?: string;
  tabList?: string;
  tabButton?: string;
  tabButtonActive?: string;
  tabPanel?: string;
};

export type ConvexAdminPortalCopy = {
  profileTab?: string;
  sessionsTab?: string;
  securityTab?: string;
  workspaceTab?: string;
};

export type ConvexAdminPortalProps = {
  /** Optional auth client. When omitted, the component uses the context client. */
  authClient?: ConvexBetterAuthClient | null;
  /** Override the active session token shown in the sessions list. */
  currentSessionToken?: string | null;
  /** Organizations to list in the Workspace tab. When omitted, the tab is hidden. */
  organizations?: readonly ConvexOrgListOrganization[];
  /** Pending workspace invitations. */
  invitations?: readonly ConvexOrgListInvitation[];
  /** ID of the currently selected organization. */
  currentOrganizationId?: string | null;
  /** Called when the user selects an organization in the Workspace tab. */
  onSelectOrganization?: (organizationId: string) => void | Promise<void>;
  /** Called when the user accepts a workspace invitation. */
  onAcceptInvitation?: (invitationId: string) => void | Promise<void>;
  /** Called when the user rejects a workspace invitation. */
  onRejectInvitation?: (invitationId: string) => void | Promise<void>;
  /** Called when the user creates a new workspace. */
  onCreateOrganization?: () => void | Promise<void>;
  /** Issuer shown in the authenticator app during 2FA setup. */
  twoFactorIssuer?: string;
  /** Tab shown on first render. */
  defaultTab?: ConvexAdminPortalTab;
  classNames?: ConvexAdminPortalClassNames;
  copy?: ConvexAdminPortalCopy;
};

const defaultCopy: Required<ConvexAdminPortalCopy> = {
  profileTab: "Profile",
  sessionsTab: "Sessions",
  securityTab: "Security",
  workspaceTab: "Workspace",
};

function resolveCopy(copy: ConvexAdminPortalCopy | undefined): Required<ConvexAdminPortalCopy> {
  return { ...defaultCopy, ...copy };
}

function useAdminPortalUser(authClient: ConvexBetterAuthClient | null | undefined): {
  user: ConvexUserProfileUser | undefined;
  isLoading: boolean;
  currentSessionToken: string | null;
} {
  const session = authClient?.useSession();
  const user = useMemo<ConvexUserProfileUser | undefined>(() => {
    const sessionUser = session?.data?.user;
    if (!sessionUser) return undefined;
    return {
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name ?? null,
      imageUrl: sessionUser.image ?? null,
      emailVerified: sessionUser.emailVerified ?? false,
      providers: [],
    };
  }, [session?.data?.user]);

  return {
    user,
    isLoading: session?.isPending ?? false,
    currentSessionToken: session?.data?.session?.token ?? null,
  };
}

export function ConvexAdminPortal(props: ConvexAdminPortalProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const resolvedCopy = resolveCopy(props.copy);
  const classNames = props.classNames ?? {};

  const { user, isLoading, currentSessionToken } = useAdminPortalUser(authClient);
  const { updateProfile } = useConvexAuthUpdateProfile(authClient);
  const [activeTab, setActiveTab] = useState<ConvexAdminPortalTab>(props.defaultTab ?? "profile");
  const [profileError, setProfileError] = useState<string | null>(null);

  const handleUpdateProfile = useCallback(
    async (input: { name: string; imageUrl?: string | null }) => {
      setProfileError(null);
      const result = await updateProfile({
        name: input.name,
        image: input.imageUrl || undefined,
      });
      if (!result.ok) {
        setProfileError(result.error);
      }
    },
    [updateProfile],
  );

  const handleManageTwoFactor = useCallback(() => {
    setActiveTab("security");
  }, []);

  const tabs: { id: ConvexAdminPortalTab; label: string }[] = [
    { id: "profile", label: resolvedCopy.profileTab },
    { id: "sessions", label: resolvedCopy.sessionsTab },
    { id: "security", label: resolvedCopy.securityTab },
  ];
  if (props.organizations !== undefined) {
    tabs.push({ id: "workspace", label: resolvedCopy.workspaceTab });
  }

  const activeIsAvailable = tabs.some((tab) => tab.id === activeTab);
  const selectedTab = activeIsAvailable ? activeTab : tabs[0].id;

  return (
    <div
      className={cn(
        "border-foreground/10 bg-foreground/5 flex min-h-[24rem] flex-col gap-4 rounded-2xl border p-4 shadow-2xl backdrop-blur md:flex-row",
        classNames.root,
      )}
    >
      <nav
        className={cn(
          "border-foreground/10 flex flex-row gap-1 border-b md:flex-col md:border-b-0 md:border-r",
          classNames.tabList,
        )}
        aria-label="Admin portal"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "text-foreground/70 hover:text-foreground h-10 px-4 text-left text-sm font-medium transition-colors md:w-40",
              classNames.tabButton,
              selectedTab === tab.id &&
                cn("text-foreground bg-foreground/10 rounded-md", classNames.tabButtonActive),
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        className={cn("min-w-0 flex-1 p-1", classNames.tabPanel)}
        role="tabpanel"
        aria-live="polite"
      >
        {selectedTab === "profile" ? (
          <ProfilePanel
            user={user}
            isLoading={isLoading}
            errorMessage={profileError}
            onUpdateProfile={handleUpdateProfile}
            onManageTwoFactor={handleManageTwoFactor}
          />
        ) : null}
        {selectedTab === "sessions" ? (
          <SessionsPanel
            authClient={authClient}
            currentSessionToken={props.currentSessionToken ?? currentSessionToken}
          />
        ) : null}
        {selectedTab === "security" ? (
          <SecurityPanel authClient={authClient} issuer={props.twoFactorIssuer} />
        ) : null}
        {selectedTab === "workspace" && props.organizations !== undefined ? (
          <WorkspacePanel
            organizations={props.organizations}
            invitations={props.invitations}
            currentOrganizationId={props.currentOrganizationId}
            onSelectOrganization={props.onSelectOrganization}
            onAcceptInvitation={props.onAcceptInvitation}
            onRejectInvitation={props.onRejectInvitation}
            onCreateOrganization={props.onCreateOrganization}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProfilePanel(props: {
  user: ConvexUserProfileUser | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  onUpdateProfile: (input: { name: string; imageUrl?: string | null }) => Promise<void>;
  onManageTwoFactor: () => void;
}) {
  return (
    <ConvexUserProfile
      user={props.user}
      isLoading={props.isLoading}
      errorMessage={props.errorMessage}
      onUpdateProfile={props.onUpdateProfile}
      onManageTwoFactor={props.onManageTwoFactor}
    />
  );
}

function SessionsPanel(props: {
  authClient: ConvexBetterAuthClient | null | undefined;
  currentSessionToken: string | null | undefined;
}) {
  return (
    <ConvexSessionList
      authClient={props.authClient ?? null}
      currentSessionToken={props.currentSessionToken}
    />
  );
}

function SecurityPanel(props: {
  authClient: ConvexBetterAuthClient | null | undefined;
  issuer: string | undefined;
}) {
  return <ConvexEnableTwoFactorForm authClient={props.authClient ?? null} issuer={props.issuer} />;
}

function WorkspacePanel(props: {
  organizations: readonly ConvexOrgListOrganization[];
  invitations?: readonly ConvexOrgListInvitation[];
  currentOrganizationId?: string | null;
  onSelectOrganization?: (organizationId: string) => void | Promise<void>;
  onAcceptInvitation?: (invitationId: string) => void | Promise<void>;
  onRejectInvitation?: (invitationId: string) => void | Promise<void>;
  onCreateOrganization?: () => void | Promise<void>;
}) {
  if (!props.onSelectOrganization) {
    return <p className="text-foreground/60 text-sm">Workspace management is not configured.</p>;
  }

  return (
    <ConvexOrganizationList
      organizations={props.organizations}
      invitations={props.invitations}
      currentOrganizationId={props.currentOrganizationId}
      onSelectOrganization={props.onSelectOrganization}
      onAcceptInvitation={props.onAcceptInvitation}
      onRejectInvitation={props.onRejectInvitation}
      onCreateOrganization={props.onCreateOrganization}
    />
  );
}
