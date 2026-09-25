import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  envPrefix: "EXPO_PUBLIC_",
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "node_modules/react-native-web"),
    },
    extensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js"],
  },
  optimizeDeps: {
    exclude: [
      "expo",
      "expo-constants",
      "expo-linking",
      "expo-modules-core",
      "expo-network",
      "expo-secure-store",
      "expo-web-browser",
    ],
  },
  build: {
    rolldownOptions: {
      // Optional expo-* peers (social sign-in fallbacks in the auth package)
      // are native-only and resolve to nothing usable on web; externalize so
      // rolldown doesn't bundle them. The whole expo family is covered because
      // any expo specifier transitively imports expo-modules-core, whose type
      // re-exports hard-fail rolldown builds.
      external: /^expo($|-)/,
    },
  },
});
