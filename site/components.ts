import { defineComponents } from "blume";

export default defineComponents({
  mdx: {
    // Static table rendered from generated/props-registry.json — no
    // hydration, so no `client` entry.
    PropsTable: { component: "./components/PropsTable.astro" },
  },
});
