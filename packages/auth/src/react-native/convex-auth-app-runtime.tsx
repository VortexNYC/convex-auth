import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useEffect, type ReactNode } from "react";

import type { ConvexAuthState, ConvexAuthUserState } from "../react/client";
import {
  AuthRuntimeProvider,
  ConvexAuthIdentityProvisioner,
  getConvexAuthActions,
  useAuthState,
  useConvexAuthClientContext,
  useConvexAuthUser,
  useGuardedProtectedWrite,
} from "../react/client";
import { DEFAULT_AUTH_RUNTIME_STATUS } from "../react/client";
import type { NativeAuthActions } from "../react/client";

import {
  ExpoAuthAcceptInvitePage,
  ExpoAuthOrganizationChooserPage,
  ExpoAuthPostSignUpPage,
} from "./auth-pages";
import { ExpoConvexAuthClientProvider } from "./convex-auth-client-provider";
import {
  ExpoAuthClientSignInScreen,
  ExpoAuthClientSignUpScreen,
} from "./convex-auth-client-screens";
import type { ExpoConvexAuthStorage } from "./ConvexAuthProvider";

export type ConvexAuthOrganizationChooserRoutePageProps = Parameters<
  typeof ExpoAuthOrganizationChooserPage
>[0];

export type ConvexAuthPostSignUpRoutePageProps = Parameters<typeof ExpoAuthPostSignUpPage>[0];

export type ConvexAuthAcceptInviteRoutePageProps = Parameters<typeof ExpoAuthAcceptInvitePage>[0];

type NavigateTo = (args: { to: string; replace?: boolean }) => void | Promise<void>;

type ConvexAuthRuntimeCreateArgs = {
  actions: NativeAuthActions;
  storage: ExpoConvexAuthStorage;
  signInPath: string;
  signUpPath: string;
};

export type ConvexAuthSignInRoutePageProps = {
  signUpPath: string;
  postSignInPath: string;
  navigate: NavigateTo;
  forgotPasswordHref?: string;
  title?: string;
  description?: string;
};

export type ConvexAuthSignUpRoutePageProps = {
  signInPath: string;
  postSignUpPath: string;
  navigate: NavigateTo;
  title?: string;
  description?: string;
};

type ConvexAuthConvexIdentityProvisionerProps = {
  auth: ConvexAuthState;
  getCurrentUser: FunctionReference<"query", "public", Record<string, never>, unknown>;
  provisionCurrentUser: FunctionReference<"mutation", "public", Record<string, never>, unknown>;
};

export type ConvexAuthRuntimeConvexIdentityProvisionerProps = Omit<
  ConvexAuthConvexIdentityProvisionerProps,
  "auth"
>;

export type ExpoAuthAuthenticatedRouteProps = {
  children: ReactNode;
  getDefaultOrganization: FunctionReference<"query", "public", Record<string, never>, unknown>;
  navigate: NavigateTo;
  pathname: string;
  signInPath: string;
  chooseOrganizationPath?: string;
  requireOrganization?: boolean;
  renderLoading: () => ReactNode;
  renderOrganizationRequired?: () => ReactNode;
};

export function createExpoConvexAuthRuntime(args: ConvexAuthRuntimeCreateArgs) {
  function useAuth() {
    const authClient = useConvexAuthClientContext();
    return useAuthState(authClient);
  }

  function useUser(): ConvexAuthUserState {
    const authClient = useConvexAuthClientContext();
    return useConvexAuthUser(authClient);
  }

  function useAuthActions() {
    const authClient = useConvexAuthClientContext();
    return getConvexAuthActions({
      authClient,
      signInPath: args.signInPath,
      signUpPath: args.signUpPath,
    });
  }

  function RuntimeProvider(props: { children: ReactNode; identityProvisioner?: ReactNode }) {
    return (
      <ExpoConvexAuthClientProvider actions={args.actions} storage={args.storage}>
        <AuthRuntimeProvider status={DEFAULT_AUTH_RUNTIME_STATUS}>
          {props.identityProvisioner}
          {props.children}
        </AuthRuntimeProvider>
      </ExpoConvexAuthClientProvider>
    );
  }

  function ConvexIdentityProvisioner(props: ConvexAuthRuntimeConvexIdentityProvisionerProps) {
    const auth = useAuth();
    const currentUser = useQuery(props.getCurrentUser, auth.isSignedIn ? {} : "skip");
    const provisionCurrentUser = useGuardedProtectedWrite(useMutation(props.provisionCurrentUser));
    const authClient = useConvexAuthClientContext();
    const session = authClient?.useSession();

    return (
      <ConvexAuthIdentityProvisioner
        auth={auth}
        currentUser={currentUser}
        provisionCurrentUser={async () => await provisionCurrentUser({})}
        sessionSubject={session?.data?.user.id ?? null}
      />
    );
  }

  function SignedIn(props: { children: ReactNode }) {
    const auth = useAuth();
    if (!auth.isSignedIn) {
      return null;
    }
    return <>{props.children}</>;
  }

  function SignedOut(props: { children: ReactNode }) {
    const auth = useAuth();
    if (auth.isSignedIn) {
      return null;
    }
    return <>{props.children}</>;
  }

  function SignInScreen(props: ConvexAuthSignInRoutePageProps) {
    return (
      <ExpoAuthClientSignInScreen
        description={props.description}
        forceRedirectUrl={props.postSignInPath}
        forgotPasswordHref={props.forgotPasswordHref}
        navigate={props.navigate}
        signUpUrl={props.signUpPath}
        title={props.title}
      />
    );
  }

  function SignUpScreen(props: ConvexAuthSignUpRoutePageProps) {
    return (
      <ExpoAuthClientSignUpScreen
        description={props.description}
        forceRedirectUrl={props.postSignUpPath}
        navigate={props.navigate}
        signInUrl={props.signInPath}
        title={props.title}
      />
    );
  }

  function AuthenticatedRoute(props: ExpoAuthAuthenticatedRouteProps) {
    const auth = useAuth();
    const organization = useQuery(props.getDefaultOrganization, auth.isSignedIn ? {} : "skip");

    useEffect(() => {
      if (!auth.isLoaded) {
        return;
      }
      if (!auth.isSignedIn) {
        void props.navigate({ to: props.signInPath, replace: true });
        return;
      }
      if (props.requireOrganization && organization === null) {
        if (props.chooseOrganizationPath !== undefined) {
          void props.navigate({ to: props.chooseOrganizationPath, replace: true });
        }
      }
    }, [auth, organization, props]);

    if (!auth.isLoaded) {
      return <>{props.renderLoading()}</>;
    }
    if (!auth.isSignedIn) {
      return <>{props.renderLoading()}</>;
    }
    if (props.requireOrganization) {
      if (organization === undefined) {
        return <>{props.renderLoading()}</>;
      }
      if (organization === null) {
        return props.renderOrganizationRequired ? (
          <>{props.renderOrganizationRequired()}</>
        ) : (
          <>{props.renderLoading()}</>
        );
      }
    }

    return <>{props.children}</>;
  }

  return {
    AuthRuntimeProvider: RuntimeProvider,
    AuthSignInRoutePage: SignInScreen,
    AuthSignUpRoutePage: SignUpScreen,
    AuthSignInScreen: SignInScreen,
    AuthSignUpScreen: SignUpScreen,
    AuthAcceptInviteRoutePage: ExpoAuthAcceptInvitePage,
    AuthOrganizationChooserRoutePage: ExpoAuthOrganizationChooserPage,
    AuthPostSignUpRoutePage: ExpoAuthPostSignUpPage,
    AuthenticatedRoute,
    ConvexIdentityProvisioner,
    SignedIn,
    SignedOut,
    actions: args.actions,
    storage: args.storage,
    useAppAuth: useAuth,
    useAppAuthActions: useAuthActions,
    useAppUser: useUser,
  };
}
