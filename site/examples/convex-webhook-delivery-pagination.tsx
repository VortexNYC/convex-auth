import { ConvexWebhookDeliveryPagination } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_DELIVERIES } from "./_shared";

export default function WebhookDeliveryPaginationPreview() {
  return (
    <ConvexWebhookDeliveryPagination
      page={{
        items: MOCK_WEBHOOK_DELIVERIES,
        total: 42,
        offset: 0,
        limit: 10,
        hasMore: true,
      }}
      onNext={() => {}}
      onPrevious={() => {}}
    />
  );
}
