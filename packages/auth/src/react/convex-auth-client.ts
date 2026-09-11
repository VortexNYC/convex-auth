import { useAuthActions } from "./ConvexAuthProvider";
import type { ConvexAuthSessionListItem, ConvexBetterAuthClient } from "./auth-client-types";

function toError(err: unknown): { message: string } {
  if (err instanceof Error) {
    return { message: err.message };
  }
  if (typeof err === "string") {
    return { message: err };
  }
  if (
    err !== null &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return { message: err.message };
  }
  return { message: "Unknown error" };
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

  const currentToken = () => actions.token;

  const resolveTwoFactorToken = () => actions.twoFactorChallengeToken ?? actions.token;

  return {
    useSession: () => session,

    signOut: async () => {
      await actions.signOut();
    },

    signIn: {
      email: async (args) => {
        try {
          const data = await actions.signIn({ ...args, rememberMe: args.rememberMe ?? false });
          actions.setTwoFactorChallengeToken(data.twoFactorChallengeToken ?? null);
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
      anonymous: async (args) => {
        if (actions.signInAnonymous === undefined) {
          return { data: null, error: toError("Anonymous sign-in is not configured") };
        }
        try {
          const data = await actions.signInAnonymous(args ?? {});
          return { data, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
    },

    linkAccount: async (args) => {
      if (actions.linkAnonymousAccount === undefined) {
        return { data: null, error: toError("Anonymous account linking is not configured") };
      }
      try {
        const data = await actions.linkAnonymousAccount(args);
        return { data, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    signInWithMagicLink: async (args) => {
      if (actions.signInWithMagicLink === undefined) {
        return { data: null, error: toError("Magic link is not available") };
      }
      try {
        const result = await actions.signInWithMagicLink(args);
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    signInWithEmailOtp: async (args) => {
      if (actions.sendVerificationOtp === undefined) {
        return { data: null, error: toError("Email OTP is not available") };
      }
      try {
        const result = await actions.sendVerificationOtp({ ...args, type: args.type ?? "sign-in" });
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    verifyEmailOtp: async (args) => {
      if (actions.verifyEmailOtp === undefined) {
        return { data: null, error: toError("Email OTP verification is not available") };
      }
      try {
        const result = await actions.verifyEmailOtp({ ...args, type: args.type ?? "sign-in" });
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    signUp: {
      email: async (args) => {
        try {
          const data = await actions.signUp({ ...args, rememberMe: args.rememberMe ?? false });
          actions.setTwoFactorChallengeToken(data.twoFactorChallengeToken ?? null);
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

    updateUser: async (args) => {
      try {
        const result = await actions.updateUser(args);
        if (!result.success) {
          throw new Error(result.error ?? "Update failed");
        }
        return { data: result, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    listSessions: async () => {
      if (actions.listSessions === undefined) {
        return { data: null, error: toError("Session listing is not available") };
      }
      try {
        const sessions: ConvexAuthSessionListItem[] = await actions.listSessions();
        return { data: sessions, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    revokeSession: async (args) => {
      if (actions.revokeSession === undefined) {
        return { data: null, error: toError("Revoke is not available") };
      }
      try {
        await actions.revokeSession(args);
        return { data: { status: true }, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    revokeOtherSessions: async () => {
      if (actions.revokeOtherSessions === undefined) {
        return { data: null, error: toError("Revoke is not available") };
      }
      try {
        await actions.revokeOtherSessions();
        return { data: { status: true }, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    forgetPassword: async (args) => {
      try {
        const result = await actions.sendPasswordReset({
          email: args.email,
          redirectTo: args.redirectTo,
        });
        return { data: result, error: null };
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
        const token = currentToken();
        if (token === null) {
          return {
            data: null,
            error: toError("Session required to enable two-factor authentication"),
          };
        }
        try {
          const result = await actions.twoFactor.enable(args);
          if (typeof result.error === "string") {
            return { data: null, error: toError(result.error) };
          }
          // The enable action returns the session token so verification can proceed.
          actions.setTwoFactorChallengeToken(result.token ?? token);
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
        const token = resolveTwoFactorToken();
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
        const token = resolveTwoFactorToken();
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
        const token = currentToken();
        if (token === null) {
          return {
            data: null,
            error: toError("Session required to disable two-factor authentication"),
          };
        }
        try {
          const result = await actions.twoFactor.disable(args);
          return { data: { status: result.success }, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
      generateBackupCodes: async (args) => {
        const token = currentToken();
        if (token === null) {
          return { data: null, error: toError("Session required to generate backup codes") };
        }
        try {
          const result = await actions.twoFactor.generateBackupCodes(args);
          if (typeof result.error === "string") {
            return { data: null, error: toError(result.error) };
          }
          return { data: { status: true, backupCodes: result.backupCodes }, error: null };
        } catch (err) {
          return { data: null, error: toError(err) };
        }
      },
    },
  } satisfies ConvexBetterAuthClient;
}
