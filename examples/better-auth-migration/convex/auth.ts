import { components } from "./_generated/api";
import { convexAuth } from "@vortex-api/convex-auth/convex";

export const auth = convexAuth({
  component: components.convexAuth,
  emailAndPassword: { enabled: true },
});

export const { signUp, signIn, signOut } = auth;
