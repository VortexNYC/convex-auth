import { useState } from "react";

import {
  AuthSignInForm,
  AuthSignUpForm,
  type AuthFormClassNames,
  type AuthProviderOption,
} from "./auth-forms";
import { AuthAlert } from "./ui";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import type { ConvexBetterAuthClient, ConvexAuthSocialProvider } from "./auth-client-types";

function toAuthProviderOptions(
  socialProviders: readonly ConvexAuthSocialProvider[] | undefined,
): readonly AuthProviderOption[] | undefined {
  if (socialProviders === undefined || socialProviders.length === 0) {
    return undefined;
  }

  return socialProviders.map((provider) => ({
    id: provider.provider,
    label: provider.label,
    disabled: provider.disabled,
  }));
}

export type ConvexAuthClientSignInScreenProps = {
  authClient?: ConvexBetterAuthClient | null;
  signUpUrl: string;
  forceRedirectUrl: string;
  /** When set, AuthSignInForm renders a forgot-password link to this href. */
  forgotPasswordHref?: string;
  description?: string;
  title?: string;
  classNames?: AuthFormClassNames;
  socialProviders?: readonly ConvexAuthSocialProvider[];
};

/**
 * Native sign-in screen. Works inside `ConvexAuthClientProvider` without an
 * `authClient` prop, or with an explicit `authClient` for legacy Better Auth
 * consumers.
 */
export function ConvexAuthClientSignInScreen(args: ConvexAuthClientSignInScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const contextClient = useConvexAuthClientContext();
  const authClient = args.authClient ?? contextClient;

  if (authClient === null) {
    return (
      <AuthAlert tone="error" title="Auth misconfigured">
        Sign-in is not available. Render this screen inside a <code>ConvexAuthClientProvider</code>{" "}
        or pass an <code>authClient</code> prop.
      </AuthAlert>
    );
  }

  const providerOptions = toAuthProviderOptions(args.socialProviders);

  return (
    <AuthSignInForm
      classNames={args.classNames}
      description={args.description ?? "Access your workspace with the shared authentication flow."}
      error={error}
      forgotPasswordHref={args.forgotPasswordHref}
      providers={providerOptions}
      onProviderSelect={
        providerOptions === undefined
          ? undefined
          : async (providerId) => {
              setError(null);
              const response = await authClient.signIn.social({
                provider: providerId,
                callbackURL: args.forceRedirectUrl,
              });
              if (typeof response.data?.url === "string" && typeof window !== "undefined") {
                window.location.assign(response.data.url);
              }
            }
      }
      footer={
        <>
          Need an account?{" "}
          <a className="text-muted-foreground hover:text-foreground" href={args.signUpUrl}>
            Create one
          </a>
        </>
      }
      isSubmitting={isSubmitting}
      onSubmit={async (values) => {
        setIsSubmitting(true);
        setError(null);

        const response = await authClient.signIn.email({
          email: values.email,
          password: values.password,
          callbackURL: args.forceRedirectUrl,
        });

        setIsSubmitting(false);

        if (response.error) {
          setError(response.error.message ?? "Sign-in failed.");
          return;
        }

        if (typeof window !== "undefined") {
          window.location.assign(args.forceRedirectUrl);
        }
      }}
      submitLabel="Sign in"
      submittingLabel="Signing in..."
      title={args.title ?? "Sign in"}
    />
  );
}

export type ConvexAuthClientSignUpScreenProps = {
  authClient?: ConvexBetterAuthClient | null;
  signInUrl: string;
  forceRedirectUrl: string;
  description?: string;
  title?: string;
  classNames?: AuthFormClassNames;
  socialProviders?: readonly ConvexAuthSocialProvider[];
};

/**
 * Native sign-up screen. Works inside `ConvexAuthClientProvider` without an
 * `authClient` prop, or with an explicit `authClient` for legacy Better Auth
 * consumers.
 */
export function ConvexAuthClientSignUpScreen(args: ConvexAuthClientSignUpScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const contextClient = useConvexAuthClientContext();
  const authClient = args.authClient ?? contextClient;

  if (authClient === null) {
    return (
      <AuthAlert tone="error" title="Auth misconfigured">
        Sign-up is not available. Render this screen inside a <code>ConvexAuthClientProvider</code>{" "}
        or pass an <code>authClient</code> prop.
      </AuthAlert>
    );
  }

  const providerOptions = toAuthProviderOptions(args.socialProviders);

  return (
    <AuthSignUpForm
      classNames={args.classNames}
      description={args.description ?? "Create your account, then continue into setup."}
      error={error}
      providers={providerOptions}
      onProviderSelect={
        providerOptions === undefined
          ? undefined
          : async (providerId) => {
              setError(null);
              const response = await authClient.signIn.social({
                provider: providerId,
                callbackURL: args.forceRedirectUrl,
              });
              if (typeof response.data?.url === "string" && typeof window !== "undefined") {
                window.location.assign(response.data.url);
              }
            }
      }
      footer={
        <>
          Already have an account?{" "}
          <a className="text-muted-foreground hover:text-foreground" href={args.signInUrl}>
            Sign in
          </a>
        </>
      }
      isSubmitting={isSubmitting}
      onSubmit={async (values) => {
        setIsSubmitting(true);
        setError(null);

        const response = await authClient.signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
          callbackURL: args.forceRedirectUrl,
        });

        setIsSubmitting(false);

        if (response.error) {
          setError(response.error.message ?? "Sign-up failed.");
          return;
        }

        if (typeof window !== "undefined") {
          window.location.assign(args.forceRedirectUrl);
        }
      }}
      submitLabel="Create account"
      submittingLabel="Creating account..."
      title={args.title ?? "Create account"}
    />
  );
}
