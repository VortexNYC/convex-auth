export type AuthReadinessState =
  | "signedOut"
  | "providerLoading"
  | "providerReady"
  | "tokenRefreshing"
  | "tokenReady"
  | "convexConnecting"
  | "convexReady"
  | "degraded"
  | "reauthRequired";

export type AuthRuntimeStatus = {
  state: AuthReadinessState;
  providerAuthenticated: boolean;
  tokenAvailable: boolean;
  convexAuthenticated: boolean;
  isRecovering: boolean;
  reauthRequired: boolean;
};
