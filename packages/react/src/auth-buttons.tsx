import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";

import { cn } from "./lib/ui";
import {
  ConvexAuthClientSignInScreen,
  ConvexAuthClientSignUpScreen,
} from "./convex-auth-client-screens";
import { useAuthActions } from "./ConvexAuthProvider";

function resolveUrl(fallback: string) {
  if (typeof window !== "undefined") {
    return window.location.href;
  }
  return fallback;
}

const buttonVariants = cva(
  "focus-visible:ring-ring/50 inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground border",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<typeof ButtonPrimitive> &
  VariantProps<typeof buttonVariants>;

function BaseButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export type ConvexSignInButtonMode = "modal" | "redirect";

export type ConvexSignInButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> &
  VariantProps<typeof buttonVariants> & {
    /** Whether the button opens a modal or navigates to a sign-in page. Default: `modal`. */
    mode?: ConvexSignInButtonMode;
    /** Label text. Default: `"Sign in"`. */
    children?: ReactNode;
    /** URL to the dedicated sign-in page. Required when `mode="redirect"`. */
    signInUrl?: string;
    /** URL the user is sent to after signing in. Default: current page. */
    forceRedirectUrl?: string;
    /** URL shown in the "Create one" link inside the modal. */
    signUpUrl?: string;
    /** Href rendered as a "Forgot password?" link inside the modal. */
    forgotPasswordHref?: string;
    className?: string;
  };

export function ConvexSignInButton({
  mode = "modal",
  children = "Sign in",
  signInUrl,
  forceRedirectUrl,
  signUpUrl,
  forgotPasswordHref,
  className,
  ...buttonProps
}: ConvexSignInButtonProps) {
  const [open, setOpen] = useState(false);

  if (mode === "redirect") {
    if (signInUrl === undefined) {
      throw new Error("ConvexSignInButton with mode='redirect' requires a signInUrl prop");
    }
    return (
      <BaseButton
        {...buttonProps}
        className={cn(className)}
        onClick={() => {
          if (typeof window !== "undefined") {
            window.location.assign(signInUrl);
          }
        }}
      >
        {children}
      </BaseButton>
    );
  }

  const redirectUrl = forceRedirectUrl ?? resolveUrl("/");
  const upUrl = signUpUrl ?? "/sign-up";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={cn(buttonVariants({ ...buttonProps, className }))}>
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Popup className="fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg sm:max-w-md">
          <div className="sr-only">
            <Dialog.Title>Sign in</Dialog.Title>
            <Dialog.Description>Sign in to your account.</Dialog.Description>
          </div>
          <ConvexAuthClientSignInScreen
            forceRedirectUrl={redirectUrl}
            signUpUrl={upUrl}
            forgotPasswordHref={forgotPasswordHref}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type ConvexSignUpButtonMode = "modal" | "redirect";

export type ConvexSignUpButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> &
  VariantProps<typeof buttonVariants> & {
    /** Whether the button opens a modal or navigates to a sign-up page. Default: `modal`. */
    mode?: ConvexSignUpButtonMode;
    /** Label text. Default: `"Sign up"`. */
    children?: ReactNode;
    /** URL to the dedicated sign-up page. Required when `mode="redirect"`. */
    signUpUrl?: string;
    /** URL the user is sent to after signing up. Default: current page. */
    forceRedirectUrl?: string;
    /** URL shown in the "Sign in" link inside the modal. */
    signInUrl?: string;
    className?: string;
  };

export function ConvexSignUpButton({
  mode = "modal",
  children = "Sign up",
  signUpUrl,
  forceRedirectUrl,
  signInUrl,
  className,
  ...buttonProps
}: ConvexSignUpButtonProps) {
  const [open, setOpen] = useState(false);

  if (mode === "redirect") {
    if (signUpUrl === undefined) {
      throw new Error("ConvexSignUpButton with mode='redirect' requires a signUpUrl prop");
    }
    return (
      <BaseButton
        {...buttonProps}
        className={cn(className)}
        onClick={() => {
          if (typeof window !== "undefined") {
            window.location.assign(signUpUrl);
          }
        }}
      >
        {children}
      </BaseButton>
    );
  }

  const redirectUrl = forceRedirectUrl ?? resolveUrl("/");
  const inUrl = signInUrl ?? "/sign-in";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={cn(buttonVariants({ ...buttonProps, className }))}>
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Popup className="fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg sm:max-w-md">
          <div className="sr-only">
            <Dialog.Title>Sign up</Dialog.Title>
            <Dialog.Description>Create a new account.</Dialog.Description>
          </div>
          <ConvexAuthClientSignUpScreen
            forceRedirectUrl={redirectUrl}
            signInUrl={inUrl}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type ConvexSignOutButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> &
  VariantProps<typeof buttonVariants> & {
    /** Label text. Default: `"Sign out"`. */
    children?: ReactNode;
    /** URL to redirect to after sign-out. */
    callbackURL?: string;
    /** Called after sign-out succeeds. */
    onSignOut?: () => void | Promise<void>;
    className?: string;
  };

export function ConvexSignOutButton({
  children = "Sign out",
  callbackURL,
  onSignOut,
  className,
  ...buttonProps
}: ConvexSignOutButtonProps) {
  const { signOut, isLoading, isAuthenticated } = useAuthActions();

  return (
    <BaseButton
      {...buttonProps}
      className={cn(className)}
      disabled={isLoading || !isAuthenticated || buttonProps.disabled}
      onClick={async () => {
        await signOut({ callbackURL });
        await onSignOut?.();
      }}
    >
      {isLoading ? "Signing out..." : children}
    </BaseButton>
  );
}
