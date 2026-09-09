export type ExpoSessionRestoreResult =
  | { kind: "restored"; userId: string }
  | { kind: "none"; reason: "no_session" | "corrupted" }
  | { kind: "error"; error: unknown };

export function parseExpoSessionRestore(state: {
  data?: unknown;
  error?: unknown;
  isPending: boolean;
}): ExpoSessionRestoreResult {
  if (state.isPending) {
    return { kind: "none", reason: "no_session" };
  }

  if (state.error) {
    return { kind: "error", error: state.error };
  }

  const data = state.data ?? null;
  if (data === null || data === undefined) {
    return { kind: "none", reason: "no_session" };
  }

  const user = typeof data === "object" && data !== null ? Reflect.get(data, "user") : undefined;
  const userId = typeof user === "object" && user !== null ? Reflect.get(user, "id") : undefined;

  if (typeof user !== "object" || user === null || typeof userId !== "string") {
    return { kind: "none", reason: "corrupted" };
  }

  return {
    kind: "restored",
    userId,
  };
}
