import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import {
  ConvexAuthAppearanceProvider,
  ConvexAuthClientProvider,
} from "@vortex-api/convex-auth/react";
import { api } from "../convex/_generated/api";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ConvexAuthClientProvider actions={api.auth}>
        <ConvexAuthAppearanceProvider>
          <App />
        </ConvexAuthAppearanceProvider>
      </ConvexAuthClientProvider>
    </ConvexProvider>
  </StrictMode>,
);
