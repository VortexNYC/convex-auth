import { ConvexWebhookDeliveryList } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_DELIVERIES } from "./_shared";

export default function WebhookDeliveryListPreview() {
  return (
    <ConvexWebhookDeliveryList
      deliveries={MOCK_WEBHOOK_DELIVERIES}
      copy={{ emptyMessage: "No deliveries yet." }}
    />
  );
}
