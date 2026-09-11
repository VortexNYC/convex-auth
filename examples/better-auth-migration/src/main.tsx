import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@vortex-api/convex-auth/react";
import { auth } from "../convex/auth";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const root = document.getElementById("root");
if (!root) throw new Error("No root element");

createRoot(root).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ConvexAuthProvider actions={auth}>
        <App />
      </ConvexAuthProvider>
    </ConvexProvider>
  </StrictMode>,
);
