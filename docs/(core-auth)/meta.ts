import { defineMeta } from "blume";

export default defineMeta({
  title: "Core auth",
  order: 2,
  display: "group",
  icon: "shield",
  pages: ["email-password", "oauth", "two-factor", "magic-links", "email-otp"],
});
