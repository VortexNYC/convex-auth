import { ConvexWebhookEndpointList } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_ENDPOINTS, MOCK_WEBHOOK_EVENT_OPTIONS, PreviewVariant } from "./_shared";

export default function WebhookEndpointListPreview() {
  return (
    <>
      <PreviewVariant label="populated">
        <ConvexWebhookEndpointList
          endpoints={MOCK_WEBHOOK_ENDPOINTS}
          copy={{ emptyMessage: "No webhook endpoints yet." }}
          sendingTestEndpointId={null}
          eventOptions={MOCK_WEBHOOK_EVENT_OPTIONS}
          onSave={() => {}}
          onSendTest={() => {}}
          onRotateSecret={() => {}}
          onDisable={() => {}}
          onArchive={() => {}}
          onDelete={() => {}}
        />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexWebhookEndpointList
          endpoints={[]}
          copy={{ emptyMessage: "No webhook endpoints yet." }}
          sendingTestEndpointId={null}
          eventOptions={MOCK_WEBHOOK_EVENT_OPTIONS}
          onSave={() => {}}
          onSendTest={() => {}}
          onRotateSecret={() => {}}
          onDisable={() => {}}
          onArchive={() => {}}
          onDelete={() => {}}
        />
      </PreviewVariant>
    </>
  );
}
