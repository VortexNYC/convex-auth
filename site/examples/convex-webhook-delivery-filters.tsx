import { ConvexWebhookDeliveryFilters } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_ENDPOINTS, MOCK_WEBHOOK_EVENT_OPTIONS } from "./_shared";

export default function WebhookDeliveryFiltersPreview() {
  return (
    <ConvexWebhookDeliveryFilters
      endpointId="all"
      endpoints={MOCK_WEBHOOK_ENDPOINTS}
      eventOptions={MOCK_WEBHOOK_EVENT_OPTIONS}
      eventType="all"
      status="all"
      onEndpointIdChange={() => {}}
      onEventTypeChange={() => {}}
      onStatusChange={() => {}}
    />
  );
}
