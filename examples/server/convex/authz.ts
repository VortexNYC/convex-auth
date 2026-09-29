import { env, type MutationCtx, type QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function requireCaller(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Authentication required");
  }
  return identity.subject;
}

/**
 * TEST-ONLY seam for the e2e fixture: the webhook write paths mint real
 * outbound fetches, so they additionally require ENABLE_WEBHOOK_PROOFS on the
 * deployment. Without it the functions fail closed — copy nothing from this
 * file into a real app.
 */
export async function requireProofCaller(ctx: Ctx): Promise<string> {
  if (env.ENABLE_WEBHOOK_PROOFS !== "true") {
    throw new Error("Webhook proof functions are disabled");
  }
  return await requireCaller(ctx);
}
