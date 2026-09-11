import { v } from "convex/values";
import { query } from "./_generated/server";
import { components } from "./_generated/api";

export const migratedUser = query({
  args: { email: v.string(), accountIdField: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, { email, accountIdField }) => {
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserByEmail, { email });
    if (!user) return null;
    const byEmail = await ctx.runQuery(components.convexAuth.native.accounts.getAccountBySubject, {
      provider: "email",
      issuer: "email",
      subject: email.toLowerCase().trim(),
    });
    let byAccountId = null;
    if (accountIdField) {
      byAccountId = await ctx.runQuery(components.convexAuth.native.accounts.getAccountBySubject, {
        provider: "email",
        issuer: "email",
        subject: accountIdField,
      });
    }
    const byUserId = await ctx.runQuery(components.convexAuth.native.accounts.getAccountBySubject, {
      provider: "password",
      issuer: "native",
      subject: user._id,
    });
    const sessions = await ctx.runQuery(components.convexAuth.native.sessions.listSessionsByUser, {
      userId: user._id,
    });
    return {
      user,
      accountByEmail: byEmail,
      accountByAccountId: byAccountId,
      accountByUserId: byUserId,
      sessionCount: sessions.length,
    };
  },
});
