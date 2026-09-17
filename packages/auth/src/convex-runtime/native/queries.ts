import { query, type QueryCtx } from "../../component/_generated/server.js";
import { v } from "convex/values";
import { verifyToken } from "./jwt.js";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";
import { nativeAuthUserValidator, toNativeAuthUser } from "./types.js";

export function nativeAuthQueries(component: NativeEmailAndPasswordComponentHandle) {
  const verifySession = query({
    args: {
      token: v.optional(v.string()),
      sessionId: v.optional(v.string()),
    },
    returns: v.object({
      user: v.optional(nativeAuthUserValidator),
      sessionId: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        const userId = identity.subject;
        const sessionId =
          typeof identity.sessionId === "string" ? identity.sessionId : args.sessionId;
        const session = await resolveSessionFromAuth(ctx, component, userId, sessionId);
        if (!session) {
          return {};
        }
        const user = await ctx.runQuery(component.native.users.getUserById, { userId });
        if (!user) {
          return {};
        }
        return { user: toNativeAuthUser(user), sessionId: session.sessionId };
      }

      if (!args.token) {
        return {};
      }

      let payload;
      try {
        payload = await verifyToken(args.token);
      } catch {
        return {};
      }
      const userId = payload.sub;
      const sessionId = payload.sessionId;
      if (typeof userId !== "string" || typeof sessionId !== "string") {
        return {};
      }

      const session = await ctx.runQuery(component.native.sessions.getSessionByToken, {
        token: args.token,
      });
      if (
        !session ||
        session.sessionId !== sessionId ||
        (session.expiresAt ?? 0) < Date.now() ||
        session.revokedAt !== undefined
      ) {
        return {};
      }

      const user = await ctx.runQuery(component.native.users.getUserById, { userId });
      if (!user) {
        return {};
      }

      return { user: toNativeAuthUser(user), sessionId };
    },
  });

  const isAuthenticated = query({
    args: {},
    returns: v.boolean(),
    handler: async (ctx, _args) => {
      const identity = await ctx.auth.getUserIdentity();
      return identity !== null;
    },
  });

  return { verifySession, isAuthenticated };
}

async function resolveSessionFromAuth(
  ctx: QueryCtx,
  component: NativeEmailAndPasswordComponentHandle,
  userId: string,
  sessionId?: string,
) {
  if (sessionId) {
    const session = await ctx.runQuery(component.native.sessions.getSessionBySessionId, {
      sessionId,
    });
    if (
      session &&
      session.userId === userId &&
      (session.expiresAt ?? 0) >= Date.now() &&
      session.revokedAt === undefined
    ) {
      return session;
    }
    return null;
  }

  return null;
}

export type NativeAuthQueries = ReturnType<typeof nativeAuthQueries>;
