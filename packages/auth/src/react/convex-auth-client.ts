import { useRef } from "react";

import { useAuthActions } from "./ConvexAuthProvider";
import type { ConvexBetterAuthClient } from "./auth-client-types";

function toError(err: unknown): { message: string } {
  return { message: err instanceof Error ? err.message : "Unknown error" };
}

/**
 * Builds a `ConvexBetterAuthClient`-shaped object over the native
 * `ConvexAuthProvider`/`useAuthActions` runtime. Existing forms and hooks
 * that expect a `ConvexBetterAuthClient` prop can receive this value
 * without changing their call sites.
 *
 * This is the bridge layer: it preserves the public method shape while
 * the implementation is now pure Convex actions.
 */
export function useConvexAuthClient() {
  const actions = useAuthActions();
  const twoFactorTokenRef = useRef<string | null>(null);

  const session = {
    data:
      actions.user === null
        ? null
        : {
            session: {
              id: actions.sessionId ?? "",
              token: actions.token,
            },
            user: {
              id: actions.user.id,
              email: actions.user.email ?? "",
              emailVerified: actions.user.emailVerified,
              image: actions.user.image ?? null,
              name: actions.user.name ?? null,
            },
          },
    error: null,
    isPending: actions.isLoading,
    isRefetching: false,
  };

  return {
    useSession: () => session,

    signOut: async () => {
      await actions.signOut();
    },

    signIn: {
      email: async (args) => {
        try {
          const data = await actions.signIn({ ...args, rememberMe: args.rememberMe ?? false });
          twoFactorTokenRef.current = data.twoFactorChallengeToken ?? null;
          return { data, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
      social: async (args) => {
        try {
          const result = await actions.signInWithRedirect(args);
          return {
            data: { ...result, redirect: true },
            error: null,
          };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
    },

    signUp: {
      email: async (args) => {
        try {
          const data = await actions.signUp({ ...args, rememberMe: args.rememberMe ?? false });
          twoFactorTokenRef.current = data.twoFactorChallengeToken ?? null;
          return { data, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
    },

    convex: {
      token: async () => ({
        data: { token: actions.token ?? null },
      }),
    },

    forgetPassword: async (args) => {
      try {
        await actions.sendPasswordReset({
          email: args.email,
          redirectTo: args.redirectTo,
        });
        return { data: { status: true }, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    resetPassword: async (args) => {
      try {
        const result = await actions.resetPassword({
          token: args.token,
          newPassword: args.newPassword,
        });
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    sendVerificationEmail: async (args) => {
      try {
        const result = await actions.sendEmailVerification({
          email: args.email,
          callbackURL: args.callbackURL,
        });
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    verifyEmail: async (args) => {
      try {
        const result = await actions.verifyEmail(args.query.token);
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    changeEmail: async (args) => {
      try {
        const result = await actions.changeEmail({
          newEmail: args.newEmail,
          callbackURL: args.callbackURL,
        });
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    twoFactor: {
      enable: async (args) => {
        try {
          const result = await actions.twoFactor.enable(args);
          if (typeof result.error === "string") {
            return { data: null, error: toError(result.error) };
          }
          return {
            data: {
              totpURI: result.totpURI ?? "",
              backupCodes: result.backupCodes ?? [],
            },
            error: null,
          };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
      verifyTotp: async (args) => {
        const token = twoFactorTokenRef.current;
        if (token === null) {
          return { data: null, error: toError("No two-factor challenge in progress") };
        }
        try {
          const result = await actions.twoFactor.verifyTotp({ ...args, token });
          if (result.token !== null) {
            actions.setToken(result.token);
            actions.setSessionId(result.sessionId ?? null);
            if (result.refreshToken) {
              actions.setRefreshToken(result.refreshToken);
            }
          }
          return { data: { token: result.token }, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
      verifyBackupCode: async (args) => {
        const token = twoFactorTokenRef.current;
        if (token === null) {
          return { data: null, error: toError("No two-factor challenge in progress") };
        }
        try {
          const result = await actions.twoFactor.verifyBackupCode({ ...args, token });
          if (result.token !== null) {
            actions.setToken(result.token);
            actions.setSessionId(result.sessionId ?? null);
            if (result.refreshToken) {
              actions.setRefreshToken(result.refreshToken);
            }
          }
          return { data: { token: result.token }, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
      disable: async (args) => {
        try {
          const result = await actions.twoFactor.disable(args);
          return { data: { status: result.success }, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
      generateBackupCodes: async (args) => {
        void args.password;
        try {
          const result = await actions.twoFactor.generateBackupCodes();
          return { data: { status: true, backupCodes: result.backupCodes }, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
    },
  } satisfies ConvexBetterAuthClient;
}
