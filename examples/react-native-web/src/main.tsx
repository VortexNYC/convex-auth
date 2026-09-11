import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import {
  ExpoConvexAuthClientProvider,
  type NativeAuthActions,
} from "@vortex-api/convex-auth/react-native";
import { auth } from "../convex/auth";
import App from "./App";

const env = import.meta as unknown as { env: Record<string, string | undefined> };
const convexUrl = env.env.EXPO_PUBLIC_CONVEX_URL;
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
      <ExpoConvexAuthClientProvider
        actions={auth as unknown as NativeAuthActions}
        storage={storage}
      >
        <App />
      </ExpoConvexAuthClientProvider>
    </ConvexProvider>
  </StrictMode>,
);
