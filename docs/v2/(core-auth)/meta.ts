import { defineMeta } from "blume";

export default defineMeta({
  title: "Core auth",
  order: 2,
  display: "group",
  icon: "shield",
  pages: [
    "email-password",
    "oauth",
    "oidc-provider",
    "two-factor",
    "magic-links",
    "email-otp",
    "passkeys",
    "anonymous",
  ],
});
