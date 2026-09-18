import type { Metadata } from "next";
import { ReactNode } from "react";
import { ConvexAuthNextjsServerProvider } from "@vortex-api/convex-auth/nextjs/server";
import { api } from "../convex/_generated/api";
import { ConvexClientProvider } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "convex-auth Next.js demo",
  description: "SSR auth with HttpOnly cookie sessions on Convex",
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          {/* Resolves + verifies the session from HttpOnly cookies on every
              server render, then hands it to the cookie-mode client provider. */}
          <ConvexAuthNextjsServerProvider actions={api.auth}>
            {props.children}
          </ConvexAuthNextjsServerProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
