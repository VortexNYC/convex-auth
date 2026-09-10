import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ExpoConvexAuthClientProvider } from "@vortex-api/convex-auth/react-native";
import { api } from "../convex/_generated/api";
import App from "./App";

const convexUrl = import.meta.env.EXPO_PUBLIC_CONVEX_URL;
if (typeof convexUrl !== "string" || convexUrl.length === 0) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl);

const storage = {
  getItem: (key: string) => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, value);
  },
  deleteItem: (key: string) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ExpoConvexAuthClientProvider actions={api.auth} storage={storage}>
        <App />
      </ExpoConvexAuthClientProvider>
    </ConvexProvider>
  </StrictMode>,
);
