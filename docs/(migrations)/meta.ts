import { defineMeta } from "blume";

export default defineMeta({
  title: "Migrations",
  order: 6,
  display: "group",
  icon: "arrow-right-left",
  pages: [
    "migrating-from-better-auth",
    "migrating-from-clerk",
    "migrating-from-workos",
    "migrating-to-feature-gated-components",
    "v3-migration",
  ],
});
