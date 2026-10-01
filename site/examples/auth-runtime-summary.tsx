import { AuthRuntimeProvider } from "../../packages/auth/src/react/AuthRuntimeProvider";
import { AuthRuntimeSummary } from "../../packages/auth/src/react/ui";

export default function RuntimeSummaryPreview() {
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
      <AuthRuntimeSummary />
    </AuthRuntimeProvider>
  );
}
