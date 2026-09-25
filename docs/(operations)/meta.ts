import { defineMeta } from "blume";

export default defineMeta({
  title: "Operations",
  order: 6,
  display: "group",
  icon: "cog",
  pages: ["security", "production", "testing", "preflight", "releasing", "troubleshooting"],
});
