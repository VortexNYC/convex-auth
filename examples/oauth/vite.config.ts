import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

const removeCrossOrigin = (): Plugin => ({
  name: "remove-crossorigin",
  enforce: "post",
  transformIndexHtml(html) {
    return html.replace(/ crossorigin/g, "");
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), removeCrossOrigin()],
});
