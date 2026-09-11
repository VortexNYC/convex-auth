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
});
