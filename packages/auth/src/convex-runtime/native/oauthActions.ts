import { action } from "../../component/_generated/server.js";
import { v } from "convex/values";
import type { FunctionReference, GenericActionCtx } from "convex/server";
import type { DataModel } from "../../component/_generated/dataModel.js";
import type { NativeOAuthComponentHandle } from "./types.js";
import { handleCallback, handleSignIn, type NativeOAuthConfig } from "./oauthHandlers.js";

export type { NativeOAuthConfig } from "./oauthHandlers.js";

export type NativeOAuthFunctionReferences = {
  [K in keyof NativeOAuthActions]: FunctionReference<"action", "public">;
};

export function nativeOAuth(component: NativeOAuthComponentHandle, config: NativeOAuthConfig) {
  const signIn = action({
    args: {
      provider: v.string(),
      callbackURL: v.optional(v.string()),
      errorURL: v.optional(v.string()),
      newUserURL: v.optional(v.string()),
      requestSignUp: v.optional(v.boolean()),
      link: v.optional(v.boolean()),
      landingVerifier: v.optional(v.string()),
    },
    returns: v.object({ url: v.string() }),
    handler: async (
      _ctx: GenericActionCtx<DataModel>,
      args: {
        provider: string;
        callbackURL?: string;
        errorURL?: string;
        newUserURL?: string;
        requestSignUp?: boolean;
        link?: boolean;
        landingVerifier?: string;
      },
    ) => {
      return await handleSignIn(config, args);
    },
  });

  const callback = action({
    args: {
      provider: v.string(),
      code: v.string(),
      state: v.string(),
      linkingUserId: v.optional(v.string()),
      landingVerifier: v.optional(v.string()),
    },
    returns: v.union(
      v.object({
        token: v.string(),
        refreshToken: v.string(),
        userId: v.string(),
        identityId: v.string(),
        sessionId: v.string(),
        redirectUrl: v.string(),
        createdUser: v.boolean(),
        landingVerifier: v.optional(v.string()),
      }),
      v.object({
        error: v.string(),
        errorDescription: v.optional(v.string()),
        redirectUrl: v.string(),
      }),
    ),
    handler: async (
      ctx: GenericActionCtx<DataModel>,
      args: {
        provider: string;
        code: string;
        state: string;
        linkingUserId?: string;
        landingVerifier?: string;
      },
    ) => {
      const result = await handleCallback(ctx, component, config, args);
      if ("error" in result) {
        return {
          error: result.error,
          errorDescription: result.errorDescription,
          redirectUrl: result.redirectUrl,
        };
      }
      return result;
    },
  });

  return { signIn, callback };
}

export type NativeOAuthActions = ReturnType<typeof nativeOAuth>;
