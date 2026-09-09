import type { ReactNode } from "react";

import type { ConvexAuthState } from "./auth-client-types";

export function AuthSignedInBoundary(args: { auth: ConvexAuthState; children: ReactNode }) {
  return args.auth.isSignedIn ? <>{args.children}</> : null;
}

export function AuthSignedOutBoundary(args: { auth: ConvexAuthState; children: ReactNode }) {
  return args.auth.isLoaded && !args.auth.isSignedIn ? <>{args.children}</> : null;
}

export function AuthLoadingBoundaryView(args: { auth: ConvexAuthState; children: ReactNode }) {
  return args.auth.isLoaded ? null : <>{args.children}</>;
}

export function AuthLoadedBoundaryView(args: { auth: ConvexAuthState; children: ReactNode }) {
  return args.auth.isLoaded ? <>{args.children}</> : null;
}
