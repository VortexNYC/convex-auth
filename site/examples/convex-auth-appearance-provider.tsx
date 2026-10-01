import { ConvexAuthAppearanceProvider } from "../../packages/auth/src/react/auth-appearance";

export default function AppearanceProviderPreview() {
  return (
    <ConvexAuthAppearanceProvider defaultTheme="light" enableSystem={false}>
      <p>Subtree inherits the configured auth appearance theme.</p>
    </ConvexAuthAppearanceProvider>
  );
}
