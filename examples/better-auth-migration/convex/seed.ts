import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const all = internalMutation({
  args: {},
  returns: v.object({ seeded: v.boolean() }),
  handler: async () => {
    // TODO: seed Better Auth data across supported plugins.
    return { seeded: false };
  },
});
