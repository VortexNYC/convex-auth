import { ConvexExhaustedWebhookDeliveryList } from "../../packages/auth/src/react/webhooks";
import { MOCK_EXHAUSTED_WEBHOOK_DELIVERIES, PreviewVariant } from "./_shared";

export default function ExhaustedWebhookDeliveryListPreview() {
  return (
    <>
      <PreviewVariant label="needs attention">
        <ConvexExhaustedWebhookDeliveryList
          deliveries={MOCK_EXHAUSTED_WEBHOOK_DELIVERIES}
          copy={{ emptyMessage: "No deliveries need attention." }}
          onRetry={() => {}}
          retryingDeliveryId={null}
        />
      </PreviewVariant>
      <PreviewVariant label="all clear">
        <ConvexExhaustedWebhookDeliveryList
          deliveries={[]}
          copy={{ emptyMessage: "No deliveries need attention." }}
          onRetry={() => {}}
          retryingDeliveryId={null}
        />
      </PreviewVariant>
    </>
  );
}
