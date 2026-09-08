import { ConvexAuthClientContextProvider } from "../react/client";
import type { ReactNode } from "react";

import { ExpoConvexAuthProvider, type ExpoConvexAuthProviderProps } from "./ConvexAuthProvider";

export type ExpoConvexAuthClientProviderProps = ExpoConvexAuthProviderProps & {
  children: ReactNode;
};

/**
 * Expo-native `ConvexAuthClientProvider`.
 *
 * Wraps `ExpoConvexAuthProvider` (Expo SecureStore token handling and deep-link
 * token injection) with the shared `ConvexAuthClientContextProvider` from
 * `convex-auth-react/client`, so RN forms and screens can use
 * `useConvexAuthClientContext()` instead of passing `authClient` everywhere.
 */
export function ExpoConvexAuthClientProvider(props: ExpoConvexAuthClientProviderProps) {
  const { children, ...expoProps } = props;
  return (
    <ExpoConvexAuthProvider {...expoProps}>
      <ConvexAuthClientContextProvider>{children}</ConvexAuthClientContextProvider>
    </ExpoConvexAuthProvider>
  );
}
