import { AuthRuntimeProvider } from "../../packages/auth/src/react/AuthRuntimeProvider";
import { AuthRuntimeStatusBadge } from "../../packages/auth/src/react/ui";

export default function RuntimeStatusBadgePreview() {
  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
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
      <AuthRuntimeProvider
        status={{
          state: "convexConnecting",
          providerAuthenticated: true,
          tokenAvailable: false,
          convexAuthenticated: false,
          isRecovering: false,
          reauthRequired: false,
        }}
      >
        <AuthRuntimeStatusBadge />
      </AuthRuntimeProvider>
    </div>
  );
}
