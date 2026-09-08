import { useAuthRuntimeStatus } from "./useAuthRuntimeStatus";

export function useProtectedConvexReady(): boolean {
  return useAuthRuntimeStatus().state === "convexReady";
}
