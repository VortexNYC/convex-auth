import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function requireCaller(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Authentication required");
  }
  return identity.subject;
}
