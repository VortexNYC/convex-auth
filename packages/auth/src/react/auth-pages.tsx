import { cn } from "./lib/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AuthFormClassNames } from "./auth-forms";
import { AuthLoadedBoundaryView, AuthLoadingBoundaryView } from "./auth-client-boundaries";
import type {
  ConvexAuthSocialProvider,
  ConvexAuthState,
  ConvexBetterAuthClient,
} from "./auth-client-types";
import {
  ConvexAuthClientSignInScreen,
  ConvexAuthClientSignUpScreen,
} from "./convex-auth-client-screens";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import {
  getAfterSignUpPath,
  getInvitationToken,
  prepareInviteAcceptRedirect,
} from "./invite-sign-up";
import { type SelectableOrganization, useConvexPostSignUpFlow } from "./post-sign-up";

export type ConvexAuthSurfaceFeature = {
  title: string;
  body: string;
  icon?: ReactNode;
};

export type ConvexAuthSurfaceClassNames = {
  root?: string;
  grid?: string;
  sidebar?: string;
  eyebrow?: string;
  sidebarTitle?: string;
  sidebarBody?: string;
  sidebarFooter?: string;
  main?: string;
  mainInner?: string;
  header?: string;
  title?: string;
  description?: string;
};

export type ConvexAuthSurfaceProps = {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
  sidebarTitle?: string;
  sidebarBody?: string;
  features?: readonly ConvexAuthSurfaceFeature[];
  footer?: ReactNode;
  className?: string;
  classNames?: ConvexAuthSurfaceClassNames;
};

export type ConvexAuthPageCopy = {
  title?: string;
  description?: string;
  loadingTitle?: string;
  loadingDescription?: string;
  unavailableTitle?: string;
  unavailableDescription?: string;
};

export type ConvexAuthPageClassNames = {
  surface?: ConvexAuthSurfaceClassNames;
  form?: AuthFormClassNames;
};

export type ConvexAuthSignInPageProps = ConvexAuthPageCopy & {
  auth: ConvexAuthState;
  authClient?: ConvexBetterAuthClient | null;
  signUpUrl: string;
  forceRedirectUrl: string;
  /** When set, AuthSignInForm renders a forgot-password link to this href. */
  forgotPasswordHref?: string;
  onOpened?: () => void;
  onRuntimeUnavailable?: () => void;
  classNames?: ConvexAuthPageClassNames;
  socialProviders?: readonly ConvexAuthSocialProvider[];
};

export type ConvexAuthSignUpPageProps = ConvexAuthPageCopy & {
  auth: ConvexAuthState;
  authClient?: ConvexBetterAuthClient | null;
  signInUrl: string;
  forceRedirectUrl: string;
  onOpened?: () => void;
  onRuntimeUnavailable?: () => void;
  classNames?: ConvexAuthPageClassNames;
  socialProviders?: readonly ConvexAuthSocialProvider[];
};

export type ConvexAuthInviteFailureReason =
  | "missing_ticket"
  | "redirect_failed"
  | "exception"
  | "retry_redirect_failed"
  | "retry_exception";

export type ConvexAuthInviteFailureEvent = {
  hasTicket: boolean;
  reason: ConvexAuthInviteFailureReason;
  redirectPath?: string;
};

export type ConvexAuthInviteOpenedEvent = {
  invitationToken: string;
  redirectPath?: string;
};

export type ConvexAuthInviteRedirectedEvent = {
  invitationToken: string;
  redirectPath?: string;
  signUpUrl: string;
};

export type ConvexAuthInviteExceptionEvent = {
  error: unknown;
  hasTicket: boolean;
  step: "redirect-to-sign-up" | "retry-sign-up";
};

export type ConvexAuthAcceptInvitePageProps = {
  buildSignUpUrl: () => string;
  redirectToSignIn: (options?: { signInForceRedirectUrl?: string }) => void | Promise<void>;
  signInPath: string;
  signUpPath: string;
  postSignUpPath: string;
  getInvitationEmail?: (invitationToken: string, params: URLSearchParams) => Promise<string | null>;
  toSafeRedirectPath?: (url: string) => string | undefined;
  onOpened?: (event: ConvexAuthInviteOpenedEvent) => void;
  onRedirected?: (event: ConvexAuthInviteRedirectedEvent) => void;
  onFailed?: (event: ConvexAuthInviteFailureEvent) => void;
  onException?: (event: ConvexAuthInviteExceptionEvent) => void;
  title?: string;
  description?: string;
  eyebrow?: string;
  loadingTitle?: string;
  loadingDescription?: string;
  unavailableTitle?: string;
  inviteRecoveryError?: string;
  inviteOpenFailureError?: string;
  inviteRetryFailureError?: string;
};

export type ConvexAuthPostSignUpPageProps = {
  currentOrganization: unknown;
  availableOrganizations: readonly SelectableOrganization[] | null | undefined;
  invitationToken: string | null;
  ensureActiveOrganization: () => Promise<unknown>;
  redeemInvitation: (token: string) => Promise<unknown>;
  onCurrentOrganizationReady: () => void;
  onOpenOrganizationSetup: () => void | Promise<void>;
  onRefresh?: () => void;
  timeoutMs?: number;
  title?: string;
  description?: string;
  eyebrow?: string;
  loadingTitle?: string;
  timedOutTitle?: string;
  timedOutDescription?: string;
  refreshLabel?: string;
  openOrganizationSetupLabel?: string;
};

export type ConvexAuthOrganizationChooserItem = SelectableOrganization & {
  _id: string;
  name: string;
  roleTemplate?: string | null;
};

export type ConvexAuthCurrentOrganization = {
  _id: string;
  name?: string | null;
};

export type ConvexAuthOrganizationChooserPageProps = {
  currentOrganization?: ConvexAuthCurrentOrganization | null;
  organizations: readonly ConvexAuthOrganizationChooserItem[] | undefined;
  onSelectOrganization: (organization: ConvexAuthOrganizationChooserItem) => Promise<void>;
  title?: string;
  description?: string;
  eyebrow?: string;
  loadingTitle?: string;
  loadingDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  currentLabel?: string;
  pendingLabel?: string;
  selectErrorTitle?: string;
  selectErrorDescription?: string;
};

const defaultFeatures: readonly ConvexAuthSurfaceFeature[] = [
  {
    title: "Protected sign-in",
    body: "Auth and Convex stay inside one access flow.",
  },
  {
    title: "Organization-aware access",
    body: "Invites and workspace selection route users to the correct team.",
  },
  {
    title: "Recovery built in",
    body: "Expired links and slow sync states explain the next step clearly.",
  },
];

export function ConvexAuthSurface({
  children,
  title,
  description,
  eyebrow = "Workspace access",
  sidebarTitle = "Sign-in stays tied to the workspace you actually use.",
  sidebarBody = "Authentication, invites, and organization access stay in one path so users land in the right account on the first try.",
  features = defaultFeatures,
  footer,
  className,
  classNames,
}: ConvexAuthSurfaceProps) {
  return (
    <div
      className={cn(
        "bg-background text-foreground min-h-dvh antialiased",
        className,
        classNames?.root,
      )}
    >
      <div
        className={cn(
          "mx-auto grid min-h-dvh max-w-6xl grid-cols-1 lg:grid-cols-[minmax(19rem,25rem)_minmax(0,1fr)]",
          classNames?.grid,
        )}
      >
        <ConvexAuthSurfaceSidebar
          classNames={classNames}
          eyebrow={eyebrow}
          features={features}
          footer={footer}
          sidebarBody={sidebarBody}
          sidebarTitle={sidebarTitle}
        />
        <ConvexAuthSurfaceMain
          classNames={classNames}
          description={description}
          eyebrow={eyebrow}
          title={title}
        >
          {children}
        </ConvexAuthSurfaceMain>
      </div>
    </div>
  );
}

function ConvexAuthSurfaceSidebar(args: {
  classNames?: ConvexAuthSurfaceClassNames;
  eyebrow: string;
  features: readonly ConvexAuthSurfaceFeature[];
  footer?: ReactNode;
  sidebarBody: string;
  sidebarTitle: string;
}) {
  return (
    <aside
      className={cn(
        "border-foreground/10 hidden border-r lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-12",
        args.classNames?.sidebar,
      )}
    >
      <div className="space-y-8">
        <ConvexAuthSurfaceSidebarIntro {...args} />
        <ConvexAuthSurfaceFeatureList features={args.features} />
      </div>
      {args.footer ? (
        <div
          className={cn(
            "text-foreground/50 max-w-[30ch] text-sm text-pretty",
            args.classNames?.sidebarFooter,
          )}
        >
          {args.footer}
        </div>
      ) : null}
    </aside>
  );
}

function ConvexAuthSurfaceSidebarIntro(args: {
  classNames?: ConvexAuthSurfaceClassNames;
  eyebrow: string;
  sidebarBody: string;
  sidebarTitle: string;
}) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "border-foreground/10 text-foreground/70 inline-flex rounded-full border px-3 py-1 text-sm",
          args.classNames?.eyebrow,
        )}
      >
        {args.eyebrow}
      </div>
      <div className="space-y-3">
        <p
          className={cn(
            "max-w-[18ch] text-4xl font-semibold tracking-tight text-balance",
            args.classNames?.sidebarTitle,
          )}
        >
          {args.sidebarTitle}
        </p>
        <p
          className={cn(
            "text-foreground/60 max-w-[42ch] text-base text-pretty",
            args.classNames?.sidebarBody,
          )}
        >
          {args.sidebarBody}
        </p>
      </div>
    </div>
  );
}

function ConvexAuthSurfaceFeatureList(args: { features: readonly ConvexAuthSurfaceFeature[] }) {
  if (args.features.length === 0) return null;

  return (
    <ul role="list" className="space-y-4">
      {args.features.map((feature) => (
        <ConvexAuthSurfaceFeatureItem key={feature.title} feature={feature} />
      ))}
    </ul>
  );
}

function ConvexAuthSurfaceMain(args: {
  children: ReactNode;
  classNames?: ConvexAuthSurfaceClassNames;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <main
      className={cn(
        "flex min-h-dvh items-center justify-center px-5 py-8 sm:px-6 sm:py-10 lg:px-10",
        args.classNames?.main,
      )}
    >
      <div className={cn("w-full max-w-md space-y-6", args.classNames?.mainInner)}>
        <ConvexAuthSurfaceHeader {...args} />
        {args.children}
      </div>
    </main>
  );
}

function ConvexAuthSurfaceHeader(args: {
  classNames?: ConvexAuthSurfaceClassNames;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className={cn("space-y-2", args.classNames?.header)}>
      <p className="text-foreground/50 text-sm font-medium lg:hidden">{args.eyebrow}</p>
      <div className="space-y-1">
        <h1
          className={cn(
            "text-2xl font-semibold tracking-tight text-balance",
            args.classNames?.title,
          )}
        >
          {args.title}
        </h1>
        <p className={cn("text-foreground/60 text-base text-pretty", args.classNames?.description)}>
          {args.description}
        </p>
      </div>
    </div>
  );
}

export function ConvexAuthLoadingCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <ConvexAuthStatusCard
      title={title}
      description={description}
      icon={
        <span className="border-foreground/20 border-t-foreground size-5 animate-spin rounded-full border-2" />
      }
      role="status"
    />
  );
}

export function ConvexAuthUnavailableCard({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <ConvexAuthStatusCard
      title={title}
      description={description}
      icon={<span className="text-foreground/90 text-lg leading-none">!</span>}
      role="alert"
      actions={actions}
    />
  );
}

export function ConvexAuthActionButton({
  children,
  variant = "primary",
  onClick,
  type = "button",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void | Promise<void>;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      className={cn(
        "rounded-sm px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-foreground text-background hover:bg-foreground/90",
        variant === "secondary" &&
          "border-foreground/15 text-foreground hover:bg-foreground/10 border",
      )}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function ConvexAuthSignInPage(args: ConvexAuthSignInPageProps) {
  const title = args.title ?? "Sign in";
  const description =
    args.description ?? "Access your workspace with the shared authentication flow.";

  const contextClient = useConvexAuthClientContext();
  const authClient = args.authClient ?? contextClient;

  useOnce(args.onOpened);
  useRuntimeUnavailableEffect(authClient, args.onRuntimeUnavailable);

  return (
    <ConvexAuthSurface
      title={title}
      description={description}
      classNames={args.classNames?.surface}
    >
      {authClient === null ? (
        <ConvexAuthUnavailableCard
          title={args.unavailableTitle ?? "Sign-in is unavailable"}
          description={
            args.unavailableDescription ??
            "This app could not load the Better Auth runtime for this page."
          }
          actions={
            <ConvexAuthActionButton
              variant="secondary"
              onClick={() => {
                window.location.reload();
              }}
            >
              Try again
            </ConvexAuthActionButton>
          }
        />
      ) : (
        <>
          <AuthLoadingBoundaryView auth={args.auth}>
            <ConvexAuthLoadingCard
              title={args.loadingTitle ?? "Loading sign-in"}
              description={args.loadingDescription ?? "We're preparing your authentication form."}
            />
          </AuthLoadingBoundaryView>
          <AuthLoadedBoundaryView auth={args.auth}>
            <ConvexAuthClientSignInScreen
              authClient={authClient}
              classNames={args.classNames?.form}
              description={description}
              forceRedirectUrl={args.forceRedirectUrl}
              forgotPasswordHref={args.forgotPasswordHref}
              signUpUrl={args.signUpUrl}
              socialProviders={args.socialProviders}
              title={title}
            />
          </AuthLoadedBoundaryView>
        </>
      )}
    </ConvexAuthSurface>
  );
}

export function ConvexAuthSignUpPage(args: ConvexAuthSignUpPageProps) {
  const title = args.title ?? "Create account";
  const description = args.description ?? "Create your account, then continue into setup.";

  const contextClient = useConvexAuthClientContext();
  const authClient = args.authClient ?? contextClient;

  useOnce(args.onOpened);
  useRuntimeUnavailableEffect(authClient, args.onRuntimeUnavailable);

  return (
    <ConvexAuthSurface
      title={title}
      description={description}
      classNames={args.classNames?.surface}
    >
      {authClient === null ? (
        <ConvexAuthUnavailableCard
          title={args.unavailableTitle ?? "Sign-up is unavailable"}
          description={
            args.unavailableDescription ??
            "This app could not load the Better Auth runtime for this page."
          }
          actions={
            <ConvexAuthActionButton
              variant="secondary"
              onClick={() => {
                window.location.reload();
              }}
            >
              Try again
            </ConvexAuthActionButton>
          }
        />
      ) : (
        <>
          <AuthLoadingBoundaryView auth={args.auth}>
            <ConvexAuthLoadingCard
              title={args.loadingTitle ?? "Loading sign-up"}
              description={args.loadingDescription ?? "We're preparing your authentication form."}
            />
          </AuthLoadingBoundaryView>
          <AuthLoadedBoundaryView auth={args.auth}>
            <ConvexAuthClientSignUpScreen
              authClient={authClient}
              classNames={args.classNames?.form}
              description={description}
              forceRedirectUrl={args.forceRedirectUrl}
              signInUrl={args.signInUrl}
              socialProviders={args.socialProviders}
              title={title}
            />
          </AuthLoadedBoundaryView>
        </>
      )}
    </ConvexAuthSurface>
  );
}

export function ConvexAuthAcceptInvitePage(args: ConvexAuthAcceptInvitePageProps) {
  const title = args.title ?? "You're invited";
  const description = args.description ?? "We're connecting you to the workspace that invited you.";
  const inviteRecoveryError =
    args.inviteRecoveryError ??
    "This invite link is missing required access details or has expired. Ask your workspace administrator to resend the invitation.";
  const inviteRuntime = useInviteAcceptRuntime(args, inviteRecoveryError);

  return (
    <ConvexAuthSurface title={title} description={description} eyebrow={args.eyebrow}>
      {inviteRuntime.error ? (
        <ConvexAuthUnavailableCard
          title={args.unavailableTitle ?? "Unable to start sign-up"}
          description={inviteRuntime.error}
          actions={
            <ConvexAuthInviteErrorActions
              onOpenSignUp={inviteRuntime.retryInviteSignUp}
              onSignIn={() => {
                void args.redirectToSignIn({
                  signInForceRedirectUrl: args.signInPath,
                });
              }}
            />
          }
        />
      ) : (
        <ConvexAuthLoadingCard
          title={args.loadingTitle ?? "Preparing your invitation"}
          description={
            args.loadingDescription ?? "We're opening the account setup tied to your invitation."
          }
        />
      )}
    </ConvexAuthSurface>
  );
}

function useInviteAcceptRuntime(
  args: ConvexAuthAcceptInvitePageProps,
  inviteRecoveryError: string,
) {
  const [error, setError] = useState<string | null>(null);
  const openedRef = useRef(false);
  const afterSignUpPath = useInviteAfterSignUpPath(args.postSignUpPath);
  const navigateToInviteSignUp = useInviteSignUpNavigator(args, afterSignUpPath);

  useOpenInviteSignUpEffect({
    afterSignUpPath,
    inviteOpenFailureError: args.inviteOpenFailureError,
    inviteRecoveryError,
    navigateToInviteSignUp,
    onException: args.onException,
    onFailed: args.onFailed,
    onOpened: args.onOpened,
    openedRef,
    setError,
    signUpPath: args.signUpPath,
    toSafeRedirectPath: args.toSafeRedirectPath,
  });

  const retryInviteSignUp = useCallback(
    async () =>
      await retryInviteSignUpRedirect({
        afterSignUpPath,
        inviteRecoveryError,
        inviteRetryFailureError: args.inviteRetryFailureError,
        navigateToInviteSignUp,
        onException: args.onException,
        onFailed: args.onFailed,
        setError,
        toSafeRedirectPath: args.toSafeRedirectPath,
      }),
    [
      afterSignUpPath,
      args.inviteRetryFailureError,
      args.onException,
      args.onFailed,
      args.toSafeRedirectPath,
      inviteRecoveryError,
      navigateToInviteSignUp,
    ],
  );

  return { error, retryInviteSignUp };
}

function useInviteAfterSignUpPath(postSignUpPath: string): string {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return postSignUpPath;
    }

    return getAfterSignUpPath(window.location.search, postSignUpPath);
  }, [postSignUpPath]);
}

function useInviteSignUpNavigator(args: ConvexAuthAcceptInvitePageProps, afterSignUpPath: string) {
  const { buildSignUpUrl, getInvitationEmail, onRedirected, signUpPath, toSafeRedirectPath } = args;

  return useCallback(
    async (navigationMode: "replace" | "assign"): Promise<boolean> => {
      if (typeof window === "undefined") return false;

      const params = new URLSearchParams(window.location.search);
      const invitationToken = getInvitationToken(params);
      if (!invitationToken) return false;

      const redirectResult = await prepareInviteAcceptRedirect({
        baseSignUpUrl: buildSignUpUrl(),
        fallbackSignUpPath: signUpPath,
        currentOrigin: window.location.origin,
        currentSearch: window.location.search,
        afterSignUpPath: appendInvitationToken(afterSignUpPath, invitationToken),
        getInvitationEmail,
        toSafeRedirectPath,
      });

      if (!redirectResult.isRedirectable) return false;
      onRedirected?.({
        invitationToken: redirectResult.invitationToken,
        redirectPath: redirectResult.redirectPath,
        signUpUrl: redirectResult.signUpUrl,
      });
      navigateBrowserTo(redirectResult.signUpUrl, navigationMode);
      return true;
    },
    [
      afterSignUpPath,
      buildSignUpUrl,
      getInvitationEmail,
      onRedirected,
      signUpPath,
      toSafeRedirectPath,
    ],
  );
}

type InviteSignUpNavigator = ReturnType<typeof useInviteSignUpNavigator>;

type InviteOpenEffectArgs = {
  afterSignUpPath: string;
  inviteOpenFailureError?: string;
  inviteRecoveryError: string;
  navigateToInviteSignUp: InviteSignUpNavigator;
  onException?: (event: ConvexAuthInviteExceptionEvent) => void;
  onFailed?: (event: ConvexAuthInviteFailureEvent) => void;
  onOpened?: (event: ConvexAuthInviteOpenedEvent) => void;
  openedRef: { current: boolean };
  setError: (error: string | null) => void;
  signUpPath: string;
  toSafeRedirectPath?: (url: string) => string | undefined;
};

function useOpenInviteSignUpEffect(args: InviteOpenEffectArgs): void {
  const {
    afterSignUpPath,
    inviteOpenFailureError,
    inviteRecoveryError,
    navigateToInviteSignUp,
    onException,
    onFailed,
    onOpened,
    openedRef,
    setError,
    signUpPath,
    toSafeRedirectPath,
  } = args;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentSearch = window.location.search;
    void openInviteSignUp(
      {
        afterSignUpPath,
        inviteOpenFailureError,
        inviteRecoveryError,
        navigateToInviteSignUp,
        onException,
        onFailed,
        onOpened,
        openedRef,
        setError,
        signUpPath,
        toSafeRedirectPath,
      },
      currentSearch,
    );
  }, [
    afterSignUpPath,
    inviteOpenFailureError,
    inviteRecoveryError,
    navigateToInviteSignUp,
    onException,
    onFailed,
    onOpened,
    openedRef,
    setError,
    signUpPath,
    toSafeRedirectPath,
  ]);
}

async function openInviteSignUp(args: InviteOpenEffectArgs, currentSearch: string): Promise<void> {
  try {
    const initialResult = await prepareInviteAcceptRedirect({
      fallbackSignUpPath: args.signUpPath,
      currentOrigin: window.location.origin,
      currentSearch,
      afterSignUpPath: args.afterSignUpPath,
      toSafeRedirectPath: args.toSafeRedirectPath,
    });

    if (!initialResult.isRedirectable) {
      args.onFailed?.({ hasTicket: false, reason: "missing_ticket" });
      args.setError(args.inviteRecoveryError);
      return;
    }

    notifyInviteOpened(args, initialResult.invitationToken);
    if (await args.navigateToInviteSignUp("replace")) return;

    args.onFailed?.({
      hasTicket: true,
      reason: "redirect_failed",
      redirectPath: args.toSafeRedirectPath?.(args.afterSignUpPath),
    });
    args.setError(args.inviteRecoveryError);
  } catch (error) {
    handleInviteOpenException(args, currentSearch, error);
  }
}

function notifyInviteOpened(args: InviteOpenEffectArgs, invitationToken: string): void {
  if (args.openedRef.current) return;

  args.openedRef.current = true;
  args.onOpened?.({
    invitationToken,
    redirectPath: args.toSafeRedirectPath?.(args.afterSignUpPath),
  });
}

function handleInviteOpenException(
  args: InviteOpenEffectArgs,
  currentSearch: string,
  error: unknown,
): void {
  const hasTicket = searchHasInvitationToken(currentSearch);
  args.onFailed?.({
    hasTicket,
    reason: "exception",
    redirectPath: args.toSafeRedirectPath?.(args.afterSignUpPath),
  });
  args.onException?.({ error, hasTicket, step: "redirect-to-sign-up" });
  args.setError(
    args.inviteOpenFailureError ??
      "We couldn't open the invitation sign-up page. Please request a new invite or contact support.",
  );
}

async function retryInviteSignUpRedirect(args: {
  afterSignUpPath: string;
  inviteRecoveryError: string;
  inviteRetryFailureError?: string;
  navigateToInviteSignUp: InviteSignUpNavigator;
  onException?: (event: ConvexAuthInviteExceptionEvent) => void;
  onFailed?: (event: ConvexAuthInviteFailureEvent) => void;
  setError: (error: string | null) => void;
  toSafeRedirectPath?: (url: string) => string | undefined;
}): Promise<void> {
  try {
    if (await args.navigateToInviteSignUp("assign")) return;

    args.onFailed?.({
      hasTicket: true,
      reason: "retry_redirect_failed",
      redirectPath: args.toSafeRedirectPath?.(args.afterSignUpPath),
    });
    args.setError(args.inviteRecoveryError);
  } catch (error) {
    args.onFailed?.({
      hasTicket: true,
      reason: "retry_exception",
      redirectPath: args.toSafeRedirectPath?.(args.afterSignUpPath),
    });
    args.onException?.({ error, hasTicket: true, step: "retry-sign-up" });
    args.setError(
      args.inviteRetryFailureError ??
        "We couldn't reopen the invitation sign-up page. Please request a new invite or contact support.",
    );
  }
}

function navigateBrowserTo(signUpUrl: string, navigationMode: "replace" | "assign"): void {
  if (navigationMode === "replace") {
    window.location.replace(signUpUrl);
    return;
  }

  window.location.assign(signUpUrl);
}

function ConvexAuthInviteErrorActions(args: {
  onOpenSignUp: () => Promise<void>;
  onSignIn: () => void;
}) {
  return (
    <>
      <ConvexAuthActionButton
        onClick={() => {
          void args.onOpenSignUp();
        }}
      >
        Open sign-up
      </ConvexAuthActionButton>
      <ConvexAuthActionButton variant="secondary" onClick={args.onSignIn}>
        Go to sign-in
      </ConvexAuthActionButton>
    </>
  );
}

export function ConvexAuthPostSignUpPage(args: ConvexAuthPostSignUpPageProps) {
  const title = args.title ?? "Finalizing your workspace";
  const description = args.description ?? "We're finishing your organization access.";
  const flow = useConvexPostSignUpFlow({
    currentOrganization: args.currentOrganization,
    availableOrganizations: args.availableOrganizations,
    invitationToken: args.invitationToken,
    ensureActiveOrganization: args.ensureActiveOrganization,
    redeemInvitation: args.redeemInvitation,
    onCurrentOrganizationReady: args.onCurrentOrganizationReady,
    timeoutMs: args.timeoutMs,
  });

  return (
    <ConvexAuthSurface title={title} description={description} eyebrow={args.eyebrow}>
      {flow.hasTimedOut ? (
        <ConvexAuthUnavailableCard
          title={args.timedOutTitle ?? "Workspace setup is taking longer than expected"}
          description={
            args.timedOutDescription ??
            "Your account exists, but organization access is still syncing. Refresh or open organization setup."
          }
          actions={
            <>
              <ConvexAuthActionButton
                variant="secondary"
                onClick={() => {
                  if (args.onRefresh) {
                    args.onRefresh();
                    return;
                  }

                  window.location.reload();
                }}
              >
                {args.refreshLabel ?? "Refresh"}
              </ConvexAuthActionButton>
              <ConvexAuthActionButton
                onClick={() => {
                  void args.onOpenOrganizationSetup();
                }}
              >
                {args.openOrganizationSetupLabel ?? "Open organization setup"}
              </ConvexAuthActionButton>
            </>
          }
        />
      ) : (
        <ConvexAuthLoadingCard
          title={args.loadingTitle ?? "Finalizing your workspace"}
          description={flow.statusDescription}
        />
      )}
    </ConvexAuthSurface>
  );
}

export function ConvexAuthOrganizationChooserPage(args: ConvexAuthOrganizationChooserPageProps) {
  const title = args.title ?? "Choose organization";
  const description =
    args.description ??
    `Select the workspace you want to use. Current resolved organization: ${args.currentOrganization?.name ?? "none"}.`;
  const [selectingOrganizationId, setSelectingOrganizationId] = useState<string | null>(null);
  const [selectionFailed, setSelectionFailed] = useState(false);

  if (args.organizations === undefined) {
    return (
      <ConvexAuthSurface title={title} description={description} eyebrow={args.eyebrow}>
        <ConvexAuthLoadingCard
          title={args.loadingTitle ?? "Loading organizations"}
          description={
            args.loadingDescription ?? "We're loading the workspaces attached to your account."
          }
        />
      </ConvexAuthSurface>
    );
  }

  if (args.organizations.length === 0) {
    return (
      <ConvexAuthSurface title={title} description={description} eyebrow={args.eyebrow}>
        <ConvexAuthUnavailableCard
          title={args.emptyTitle ?? "No organizations available"}
          description={
            args.emptyDescription ??
            "Your account is authenticated but does not have a selectable organization yet."
          }
        />
      </ConvexAuthSurface>
    );
  }

  return (
    <ConvexAuthSurface title={title} description={description} eyebrow={args.eyebrow}>
      <div className="space-y-3">
        {selectionFailed ? (
          <ConvexAuthUnavailableCard
            title={args.selectErrorTitle ?? "Unable to switch organization"}
            description={
              args.selectErrorDescription ??
              "We couldn't activate that organization. Try again or choose another workspace."
            }
          />
        ) : null}
        <div className="grid gap-3">
          {args.organizations.map((organization) => {
            const isCurrentOrganization = args.currentOrganization?._id === organization._id;
            const isSelecting = selectingOrganizationId === organization._id;
            const isDisabled = !organization.canSelect || selectingOrganizationId !== null;

            return (
              <button
                key={organization._id}
                className="border-foreground/10 bg-foreground/5 hover:bg-foreground/10 rounded-lg border px-4 py-4 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDisabled}
                onClick={() => {
                  setSelectionFailed(false);
                  setSelectingOrganizationId(organization._id);
                  void args
                    .onSelectOrganization(organization)
                    .catch(() => {
                      setSelectionFailed(true);
                    })
                    .finally(() => {
                      setSelectingOrganizationId(null);
                    });
                }}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-foreground truncate font-medium">{organization.name}</p>
                    {organization.roleTemplate ? (
                      <p className="text-foreground/45 text-xs font-medium">
                        {organization.roleTemplate}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-foreground/50 shrink-0 text-xs">
                    {isSelecting
                      ? "Switching..."
                      : isCurrentOrganization
                        ? (args.currentLabel ?? "Current")
                        : !organization.canSelect
                          ? (args.pendingLabel ?? "Pending")
                          : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ConvexAuthSurface>
  );
}

function ConvexAuthSurfaceFeatureItem({ feature }: { feature: ConvexAuthSurfaceFeature }) {
  return (
    <li className="flex items-start gap-3">
      <div className="border-foreground/10 bg-foreground/5 text-foreground/90 flex size-10 items-center justify-center rounded-sm border">
        {feature.icon ?? <span className="bg-foreground/70 size-2 rounded-full" />}
      </div>
      <div className="space-y-1">
        <p className="text-foreground text-base font-medium">{feature.title}</p>
        <p className="text-foreground/50 max-w-[32ch] text-sm text-pretty">{feature.body}</p>
      </div>
    </li>
  );
}

function appendInvitationToken(path: string, invitationToken: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}invitation_token=${encodeURIComponent(invitationToken)}`;
}

function searchHasInvitationToken(currentSearch: string): boolean {
  return getInvitationToken(new URLSearchParams(currentSearch)) !== null;
}

function ConvexAuthStatusCard({
  title,
  description,
  icon,
  role,
  actions,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  role: "status" | "alert";
  actions?: ReactNode;
}) {
  return (
    <div
      className="border-foreground/10 bg-foreground/5 rounded-lg border p-6 shadow-sm"
      role={role}
    >
      <div className="space-y-4">
        <div className="border-foreground/10 bg-background/40 flex size-11 items-center justify-center rounded-sm border">
          {icon}
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl tracking-tight text-balance">{title}</h2>
          <p className="text-foreground/60 text-base text-pretty">{description}</p>
        </div>
        {actions ? <div className="flex flex-col gap-3 sm:flex-row">{actions}</div> : null}
      </div>
    </div>
  );
}

function useOnce(callback: (() => void) | undefined): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    callbackRef.current?.();
  }, []);
}

function useRuntimeUnavailableEffect(
  authClient: ConvexBetterAuthClient | null,
  callback: (() => void) | undefined,
): void {
  const callbackRef = useRef(callback);
  const reportedRef = useRef(false);
  callbackRef.current = callback;

  useEffect(() => {
    if (authClient !== null || reportedRef.current) {
      return;
    }

    reportedRef.current = true;
    callbackRef.current?.();
  }, [authClient]);
}
