import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider, type NativeAuthActions } from "@vortex-api/convex-auth/react";
import { auth } from "../convex/auth";
import App from "./App";
import "./index.css";

const env = import.meta as unknown as { env: Record<string, string | undefined> };
const convexUrl = env.env.VITE_CONVEX_URL;
if (typeof convexUrl !== "string" || convexUrl.length === 0) {
  throw new Error("VITE_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl);

const root = document.getElementById("root");
if (!root) throw new Error("No root element");

createRoot(root).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ConvexAuthProvider actions={auth as unknown as NativeAuthActions}>
        <App />
      </ConvexAuthProvider>
    </ConvexProvider>
  </StrictMode>,
);
