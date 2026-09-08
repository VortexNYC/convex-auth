# convex-auth-react-native

Expo / React Native UI components and hooks for `convex-auth`.

## Install

```bash
pnpm add convex-auth-react-native
```

This package re-exports the React components adapted for React Native and relies on `convex-auth-react` for shared behavior. It also requires `uniwind` for styling and the standard Expo peer dependencies (`expo-linking`, `expo-secure-store`, `expo-web-browser`, `expo-network`, `expo-constants`) when using OAuth flows.

## Quick start

Wrap your app with `ConvexAuthClientProvider` from `convex-auth-react-native` and use the same hooks as the React package:

```tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthClientProvider } from "convex-auth-react-native";
import { api } from "../convex/_generated/api";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <ConvexAuthClientProvider actions={api.auth}>{/* your app */}</ConvexAuthClientProvider>
    </ConvexProvider>
  );
}
```

See the [full docs](https://convex-auth.vortex.nyc) and [`docs/frameworks/react-native.mdx`](../docs/frameworks/react-native.mdx) for the complete Expo setup.

## License

Apache-2.0
