import { useState } from "react";
import { ConvexApiKeyCreateForm } from "../../packages/auth/src/react/api-keys";

export default function ApiKeyCreateFormPreview() {
  const [state, setState] = useState<{
    name: string;
    scopes: readonly ("read" | "write" | "deploy")[];
    ipAllowlist: string;
    expiresInDays: string;
  }>({ name: "", scopes: [], ipAllowlist: "", expiresInDays: "90" });
  return (
    <ConvexApiKeyCreateForm
      apiEnabled
      creating={false}
      scopeOptions={["read", "write", "deploy"]}
      state={state}
      onNameChange={(name) => setState((s) => ({ ...s, name }))}
      onScopesChange={(scopes) => setState((s) => ({ ...s, scopes }))}
      onIpAllowlistChange={(ipAllowlist) => setState((s) => ({ ...s, ipAllowlist }))}
      onExpiresInDaysChange={(expiresInDays) => setState((s) => ({ ...s, expiresInDays }))}
      onSubmit={() => {}}
    />
  );
}
