"use client";

import { ReactNode } from "react";
import type { NativeAuthActions } from "../react/ConvexAuthProvider.js";
import {
  ConvexAuthNextjsClientProvider,
  type ConvexAuthServerState,
} from "./client.js";

/**
 * Client-side auth provider for cookie-mode sessions. Most apps should use
 * `ConvexAuthNextjsServerProvider` from `@vortex-api/convex-auth/nextjs/server`
 * in their root layout — it resolves the session server-side and renders this
 * provider with the result. Use this directly only when you have the server
 * state yourself.
 */
export function ConvexAuthNextjsProvider(props: {
  serverState: ConvexAuthServerState;
  actions: NativeAuthActions;
  apiRoute?: string;
  children: ReactNode;
}) {
  return <ConvexAuthNextjsClientProvider {...props} />;
}

export type { ConvexAuthServerState };
