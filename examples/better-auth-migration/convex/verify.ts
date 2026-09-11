import { v } from "convex/values";
import { query } from "./_generated/server";
import { components } from "./_generated/api";

export const migratedUser = query({
  args: { email: v.string() },
  returns: v.any(),
  handler: async (ctx, { email }) => {
    const user = await ctx.runQuery(components.convexAuth.native.users.getUserByEmail, { email });
    if (!user) return null;
    const accountByEmail = await ctx.runQuery(
      components.convexAuth.native.accounts.getAccountBySubject,
      {
        provider: "email",
        issuer: "native",
        subject: email.toLowerCase().trim(),
      },
    );
    const accountById = await ctx.runQuery(
      components.convexAuth.native.accounts.getAccountBySubject,
      {
        provider: "email",
        issuer: "native",
        subject: user._id,
      },
    );
    const sessions = await ctx.runQuery(components.convexAuth.native.sessions.listSessionsByUser, {
      userId: user._id,
    });
    return { user, accountByEmail, accountById, sessionCount: sessions.length };
  },
});
