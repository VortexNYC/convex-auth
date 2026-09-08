import type { AuthReadinessState } from "../core";

import { useAuthRuntimeStatus } from "./useAuthRuntimeStatus";

export function useAuthStateMatches(...states: readonly AuthReadinessState[]): boolean {
  return states.includes(useAuthRuntimeStatus().state);
}
