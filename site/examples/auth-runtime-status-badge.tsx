import { AuthRuntimeProvider } from "../../packages/auth/src/react/AuthRuntimeProvider";
import { AuthRuntimeStatusBadge } from "../../packages/auth/src/react/ui";
import { PreviewVariant } from "./_shared";

export default function RuntimeStatusBadgePreview() {
  return (
    <>
      <PreviewVariant label="ready">
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
      </PreviewVariant>
      <PreviewVariant label="connecting">
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
      </PreviewVariant>
      <PreviewVariant label="token refreshing">
        <AuthRuntimeProvider
          status={{
            state: "tokenRefreshing",
            providerAuthenticated: true,
            tokenAvailable: false,
            convexAuthenticated: false,
            isRecovering: true,
            reauthRequired: false,
          }}
        >
          <AuthRuntimeStatusBadge />
        </AuthRuntimeProvider>
      </PreviewVariant>
      <PreviewVariant label="re-auth required">
        <AuthRuntimeProvider
          status={{
            state: "reauthRequired",
            providerAuthenticated: false,
            tokenAvailable: false,
            convexAuthenticated: false,
            isRecovering: false,
            reauthRequired: true,
          }}
        >
          <AuthRuntimeStatusBadge />
        </AuthRuntimeProvider>
      </PreviewVariant>
    </>
  );
}
