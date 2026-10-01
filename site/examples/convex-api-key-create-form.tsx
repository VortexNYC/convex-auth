import { ConvexApiKeyCreateForm } from "../../packages/auth/src/react/api-keys";

export default function ApiKeyCreateFormPreview() {
  return (
    <ConvexApiKeyCreateForm
      apiEnabled
      creating={false}
      scopeOptions={["read", "write", "deploy"]}
      state={{ name: "", scopes: [], ipAllowlist: "", expiresInDays: "90" }}
      onNameChange={() => {}}
      onScopesChange={() => {}}
      onIpAllowlistChange={() => {}}
      onExpiresInDaysChange={() => {}}
      onSubmit={() => {}}
    />
  );
}
