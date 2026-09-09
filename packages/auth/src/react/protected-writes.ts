import type { AuthRuntimeStatus } from "../core";
import type { ReactAction, ReactMutation } from "convex/react";
import type { FunctionReference, OptionalRestArgs } from "convex/server";

import { useAuthRuntimeStatus } from "./useAuthRuntimeStatus";

export class ProtectedWriteNotReadyError extends Error {
  readonly code = "auth_runtime_not_ready" as const;
  readonly runtimeState: AuthRuntimeStatus["state"];

  constructor(status: AuthRuntimeStatus) {
    super(getProtectedWriteNotReadyMessage(status));
    this.name = "ProtectedWriteNotReadyError";
    this.runtimeState = status.state;
  }
}

export function canRunProtectedWrite(status: AuthRuntimeStatus): boolean {
  return status.state === "convexReady";
}

export function getProtectedWriteNotReadyMessage(status: AuthRuntimeStatus): string {
  return `Protected write blocked until auth runtime is convexReady. Current state: ${status.state}.`;
}

export function guardProtectedWrite<Args, Result>(
  runner: (args: Args) => Promise<Result>,
  status: AuthRuntimeStatus,
): (args: Args) => Promise<Result> {
  return async (args: Args) => {
    if (!canRunProtectedWrite(status)) {
      throw new ProtectedWriteNotReadyError(status);
    }

    return await runner(args);
  };
}

export function useGuardedProtectedWrite<Args, Result>(
  runner: (args: Args) => Promise<Result>,
): (args: Args) => Promise<Result> {
  const status = useAuthRuntimeStatus();
  return guardProtectedWrite(runner, status);
}

async function runGuardedConvexMutation<Mutation extends FunctionReference<"mutation">>(
  runner: ReactMutation<Mutation>,
  status: AuthRuntimeStatus,
  ...args: OptionalRestArgs<Mutation>
) {
  if (!canRunProtectedWrite(status)) {
    throw new ProtectedWriteNotReadyError(status);
  }
  return await runner(...args);
}

export function useGuardedConvexMutation<Mutation extends FunctionReference<"mutation">>(
  runner: ReactMutation<Mutation>,
) {
  const status = useAuthRuntimeStatus();
  return async (...args: OptionalRestArgs<Mutation>) =>
    await runGuardedConvexMutation(runner, status, ...args);
}

async function runGuardedConvexAction<Action extends FunctionReference<"action">>(
  runner: ReactAction<Action>,
  status: AuthRuntimeStatus,
  ...args: OptionalRestArgs<Action>
) {
  if (!canRunProtectedWrite(status)) {
    throw new ProtectedWriteNotReadyError(status);
  }
  return await runner(...args);
}

export function useGuardedConvexAction<Action extends FunctionReference<"action">>(
  runner: ReactAction<Action>,
) {
  const status = useAuthRuntimeStatus();
  return async (...args: OptionalRestArgs<Action>) =>
    await runGuardedConvexAction(runner, status, ...args);
}
