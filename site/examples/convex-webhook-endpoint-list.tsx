import { ConvexWebhookEndpointList } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_ENDPOINTS, MOCK_WEBHOOK_EVENT_OPTIONS } from "./_shared";

export default function WebhookEndpointListPreview() {
  return (
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
  );
}
