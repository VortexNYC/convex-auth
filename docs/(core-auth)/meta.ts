import { defineMeta } from "blume";

export default defineMeta({
  title: "Core auth",
  order: 3,
  display: "group",
  icon: "shield",
  pages: [
    "email-password",
    "username",
    "oauth",
    "generic-oauth",
    "two-factor",
    "magic-links",
    "email-otp",
    "phone",
    "passkeys",
    "anonymous",
  ],
});
