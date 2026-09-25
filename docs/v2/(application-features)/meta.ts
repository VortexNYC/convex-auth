import { defineMeta } from "blume";

export default defineMeta({
  title: "Application features",
  order: 3,
  display: "group",
  icon: "layers",
  pages: ["organizations", "api-keys", "service-principals", "webhooks", "theming"],
});
