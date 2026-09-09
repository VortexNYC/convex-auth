import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthClientProvider } from "convex-auth/react";
import { api } from "../convex/_generated/api";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ConvexAuthClientProvider actions={api.auth}>
        <App />
      </ConvexAuthClientProvider>
    </ConvexProvider>
  </StrictMode>,
);
