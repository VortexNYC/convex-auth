import { defineMeta } from "blume";

export default defineMeta({
  title: "Operations",
  order: 5,
  display: "group",
  icon: "cog",
  pages: ["security", "production", "testing", "preflight", "releasing", "troubleshooting"],
});
