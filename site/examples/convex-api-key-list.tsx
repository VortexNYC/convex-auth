import { ConvexApiKeyList } from "../../packages/auth/src/react/api-keys";
import { MOCK_API_KEYS, PreviewVariant } from "./_shared";

export default function ApiKeyListPreview() {
  return (
    <>
      <PreviewVariant label="populated">
        <ConvexApiKeyList
          apiKeys={MOCK_API_KEYS}
          copy={{ emptyMessage: "No API keys yet." }}
          onRevoke={() => {}}
          onRotate={() => {}}
        />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexApiKeyList
          apiKeys={[]}
          copy={{ emptyMessage: "No API keys yet." }}
          onRevoke={() => {}}
          onRotate={() => {}}
        />
      </PreviewVariant>
    </>
  );
}
