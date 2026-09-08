import type { AuthRuntimeStatus } from "../core";

export type AuthRuntimeContextValue = {
  status: AuthRuntimeStatus;
};

export const DEFAULT_AUTH_RUNTIME_STATUS: AuthRuntimeStatus = {
  state: "signedOut",
  providerAuthenticated: false,
  tokenAvailable: false,
  convexAuthenticated: false,
  isRecovering: false,
  reauthRequired: false,
};
