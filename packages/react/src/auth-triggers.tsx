import { type ReactNode } from "react";

import { ConvexAuthActionButton } from "./auth-pages";

export type ConvexAuthSignInButtonProps = {
  redirectToSignIn: () => void | Promise<void>;
  children?: ReactNode;
  variant?: "primary" | "secondary";
};

export function ConvexAuthSignInButton({
  redirectToSignIn,
  children = "Sign in",
  variant = "primary",
}: ConvexAuthSignInButtonProps) {
  return (
    <ConvexAuthActionButton variant={variant} onClick={redirectToSignIn}>
      {children}
    </ConvexAuthActionButton>
  );
}

export type ConvexAuthSignUpButtonProps = {
  redirectToSignUp: () => void | Promise<void>;
  children?: ReactNode;
  variant?: "primary" | "secondary";
};

export function ConvexAuthSignUpButton({
  redirectToSignUp,
  children = "Sign up",
  variant = "secondary",
}: ConvexAuthSignUpButtonProps) {
  return (
    <ConvexAuthActionButton variant={variant} onClick={redirectToSignUp}>
      {children}
    </ConvexAuthActionButton>
  );
}

export type ConvexAuthSignOutButtonProps = {
  signOut: () => void | Promise<void>;
  children?: ReactNode;
  variant?: "primary" | "secondary";
};

export function ConvexAuthSignOutButton({
  signOut,
  children = "Sign out",
  variant = "secondary",
}: ConvexAuthSignOutButtonProps) {
  return (
    <ConvexAuthActionButton variant={variant} onClick={signOut}>
      {children}
    </ConvexAuthActionButton>
  );
}
