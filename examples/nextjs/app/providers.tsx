"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useState } from "react";

/**
 * Owns the ConvexReactClient for the browser. Renders above the auth
 * provider in the root layout — ConvexAuthProvider calls `useConvex()`,
 * so the Convex client context must wrap it.
 */
export function ConvexClientProvider(props: { children: ReactNode }) {
  const [client] = useState(
    () =>
      // Placeholder keeps `next build` prerender working without env; the
      // client never connects during static export since no queries mount.
      new ConvexReactClient(
        process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud",
      ),
  );
  return <ConvexProvider client={client}>{props.children}</ConvexProvider>;
}
