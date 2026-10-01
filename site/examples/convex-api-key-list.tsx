import { ConvexApiKeyList } from "../../packages/auth/src/react/api-keys";
import { MOCK_API_KEYS } from "./_shared";

export default function ApiKeyListPreview() {
  return (
    <ConvexApiKeyList
      apiKeys={MOCK_API_KEYS}
      copy={{ emptyMessage: "No API keys yet." }}
      onRevoke={() => {}}
      onRotate={() => {}}
    />
  );
}
