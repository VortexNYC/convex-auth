import { v } from "convex/values";
import { query } from "./_generated/server";
import { components } from "./_generated/api";

export const migratedUser = query({
  args: { email: v.string() },
  returns: v.any(),
  handler: async (ctx, { email }) => {
    return await ctx.runQuery(components.convexAuth.native.users.getUserByEmail, { email });
  },
});
