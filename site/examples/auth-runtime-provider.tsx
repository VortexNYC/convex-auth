import { AuthRuntimeProvider } from "../../packages/auth/src/react/AuthRuntimeProvider";
import { AuthRuntimeStatusBadge } from "../../packages/auth/src/react/ui";

export default function RuntimeProviderPreview() {
  return (
    <AuthRuntimeProvider
      status={{
        state: "convexReady",
        providerAuthenticated: true,
        tokenAvailable: true,
        convexAuthenticated: true,
        isRecovering: false,
        reauthRequired: false,
      }}
    >
      <AuthRuntimeStatusBadge />
    </AuthRuntimeProvider>
  );
}
