import { ConvexWebhookDeliveryList } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_DELIVERIES, PreviewVariant } from "./_shared";

export default function WebhookDeliveryListPreview() {
  return (
    <>
      <PreviewVariant label="populated">
        <ConvexWebhookDeliveryList
          deliveries={MOCK_WEBHOOK_DELIVERIES}
          copy={{ emptyMessage: "No deliveries yet." }}
        />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <ConvexWebhookDeliveryList deliveries={[]} copy={{ emptyMessage: "No deliveries yet." }} />
      </PreviewVariant>
    </>
  );
}
