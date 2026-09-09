import { createContext, useMemo, type PropsWithChildren } from "react";

import type { AuthRuntimeContextValue } from "./types";
import { DEFAULT_AUTH_RUNTIME_STATUS } from "./types";

export const AuthRuntimeContext = createContext<AuthRuntimeContextValue>({
  status: DEFAULT_AUTH_RUNTIME_STATUS,
});

export function AuthRuntimeProvider(props: PropsWithChildren<AuthRuntimeContextValue>) {
  const value = useMemo<AuthRuntimeContextValue>(() => ({ status: props.status }), [props.status]);

  return <AuthRuntimeContext.Provider value={value}>{props.children}</AuthRuntimeContext.Provider>;
}
