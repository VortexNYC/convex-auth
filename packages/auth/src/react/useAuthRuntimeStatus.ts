import type { AuthRuntimeStatus } from "../core";
import { useContext } from "react";

import { AuthRuntimeContext } from "./AuthRuntimeProvider";

export function useAuthRuntimeStatus(): AuthRuntimeStatus {
  return useContext(AuthRuntimeContext).status;
}
