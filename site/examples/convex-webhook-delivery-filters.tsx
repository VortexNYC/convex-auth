import { useState } from "react";
import { ConvexWebhookDeliveryFilters } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_ENDPOINTS, MOCK_WEBHOOK_EVENT_OPTIONS } from "./_shared";

export default function WebhookDeliveryFiltersPreview() {
  const [endpointId, setEndpointId] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [status, setStatus] = useState<"pending" | "processing" | "delivered" | "failed" | "all">(
    "all",
  );
  return (
    <ConvexWebhookDeliveryFilters
      endpointId={endpointId}
      endpoints={MOCK_WEBHOOK_ENDPOINTS}
      eventOptions={MOCK_WEBHOOK_EVENT_OPTIONS}
      eventType={eventType}
      status={status}
      onEndpointIdChange={setEndpointId}
      onEventTypeChange={setEventType}
      onStatusChange={setStatus}
    />
  );
}
