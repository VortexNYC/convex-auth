import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import {
  ConvexAuthAppearanceProvider,
  ConvexAuthClientProvider,
  useSession,
} from "@vortex-api/convex-auth/react";
import { api } from "../convex/_generated/api";
import { router } from "./router";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function InnerApp() {
  const { isLoading, isAuthenticated } = useSession();

  useEffect(() => {
    void router.invalidate();
  }, [isLoading, isAuthenticated]);

  return <RouterProvider router={router} context={{ auth: { isLoading, isAuthenticated } }} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ConvexAuthClientProvider actions={api.auth}>
        <ConvexAuthAppearanceProvider>
          <InnerApp />
        </ConvexAuthAppearanceProvider>
      </ConvexAuthClientProvider>
    </ConvexProvider>
  </StrictMode>,
);
