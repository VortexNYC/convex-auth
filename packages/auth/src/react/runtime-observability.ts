import type { AuthRuntimeStatus } from "../core";

export type AuthRuntimeTransitionEvent = {
  eventName: "auth_runtime_state_changed";
  properties: {
    surface: "runtime";
    fromState: AuthRuntimeStatus["state"];
    toState: AuthRuntimeStatus["state"];
    providerAuthenticated: boolean;
    tokenAvailable: boolean;
    convexAuthenticated: boolean;
    isRecovering: boolean;
    reauthRequired: boolean;
  };
};

export type AuthTokenRefreshFailureEvent = {
  eventName: "auth_token_refresh_failed";
  properties: {
    surface: "runtime";
    forceRefreshToken: boolean;
    hadCachedToken: boolean;
    hadFallbackToken: boolean;
    message: string | null;
  };
};

export function getAuthRuntimeTransitionEvent(
  previousStatus: AuthRuntimeStatus | null,
  nextStatus: AuthRuntimeStatus,
): AuthRuntimeTransitionEvent | null {
  if (previousStatus === null || previousStatus.state === nextStatus.state) {
    return null;
  }

  return {
    eventName: "auth_runtime_state_changed",
    properties: {
      surface: "runtime",
      fromState: previousStatus.state,
      toState: nextStatus.state,
      providerAuthenticated: nextStatus.providerAuthenticated,
      tokenAvailable: nextStatus.tokenAvailable,
      convexAuthenticated: nextStatus.convexAuthenticated,
      isRecovering: nextStatus.isRecovering,
      reauthRequired: nextStatus.reauthRequired,
    },
  };
}

export function getAuthTokenRefreshFailureEvent(args: {
  forceRefreshToken: boolean;
  hadCachedToken: boolean;
  hadFallbackToken: boolean;
  error: unknown;
}): AuthTokenRefreshFailureEvent {
  return {
    eventName: "auth_token_refresh_failed",
    properties: {
      surface: "runtime",
      forceRefreshToken: args.forceRefreshToken,
      hadCachedToken: args.hadCachedToken,
      hadFallbackToken: args.hadFallbackToken,
      message: getErrorMessage(args.error),
    },
  };
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return null;
}
