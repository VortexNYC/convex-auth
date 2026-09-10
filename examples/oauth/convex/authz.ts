import { components } from "./_generated/api";
import type { AnyDataModel, GenericMutationCtx, GenericQueryCtx } from "convex/server";

type Ctx = GenericQueryCtx<AnyDataModel> | GenericMutationCtx<AnyDataModel>;

export async function requireCaller(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Authentication required");
  }
  return identity.subject;
}

export async function requireMatchingUserId(ctx: Ctx, userId: string): Promise<string> {
  const callerId = await requireCaller(ctx);
  if (userId !== callerId) {
    throw new Error("Forbidden");
  }
  return callerId;
}

export async function requireOrganizationMembership(
  ctx: Ctx,
  userId: string,
  organizationId: string,
): Promise<void> {
  const memberships = await ctx.runQuery(
    components.convexAuth.organizations.listMembershipsByUser,
    { userId, status: "active" },
  );
  const member = memberships.find(
    (m) => m.organizationId === organizationId && m.status === "active",
  );
  if (member === undefined) {
    throw new Error("Access denied");
  }
}
