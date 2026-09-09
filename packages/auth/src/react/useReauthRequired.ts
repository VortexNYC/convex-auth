import { useAuthRuntimeStatus } from "./useAuthRuntimeStatus";

export function useReauthRequired(): boolean {
  return useAuthRuntimeStatus().reauthRequired;
}
