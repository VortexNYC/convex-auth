import { ConvexExhaustedWebhookDeliveryList } from "../../packages/auth/src/react/webhooks";
import { MOCK_EXHAUSTED_WEBHOOK_DELIVERIES } from "./_shared";

export default function ExhaustedWebhookDeliveryListPreview() {
  return (
    <ConvexExhaustedWebhookDeliveryList
      deliveries={MOCK_EXHAUSTED_WEBHOOK_DELIVERIES}
      copy={{ emptyMessage: "No deliveries need attention." }}
      onRetry={() => {}}
      retryingDeliveryId={null}
    />
  );
}
