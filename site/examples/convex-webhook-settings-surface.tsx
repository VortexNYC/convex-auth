import { ConvexWebhookSettingsSurface } from "../../packages/auth/src/react/webhooks";
import { ConvexPreviewShell, MOCK_WEBHOOK_EVENT_OPTIONS, fnRef } from "./_shared";

export default function WebhookSettingsSurfacePreview() {
  // Queries stay pending without a live deployment, so the surface renders
  // its loading branch.
  return (
    <ConvexPreviewShell>
      <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        No deployment attached — the surface renders its loading state. Wired to a live backend it
        fills in with your data.
      </p>
      <ConvexWebhookSettingsSurface
        enabled
        eventOptions={MOCK_WEBHOOK_EVENT_OPTIONS}
        organizationId="o1"
        createRequestId={(prefix) => `${prefix}_preview`}
        refs={{
          listEndpoints: fnRef("webhooks:listEndpoints"),
          listExhaustedDeliveries: fnRef("webhooks:listExhaustedDeliveries"),
          listRecentDeliveries: fnRef("webhooks:listRecentDeliveries"),
          createEndpoint: fnRef("webhooks:createEndpoint"),
          updateEndpoint: fnRef("webhooks:updateEndpoint"),
          rotateEndpointSecret: fnRef("webhooks:rotateEndpointSecret"),
          archiveEndpoint: fnRef("webhooks:archiveEndpoint"),
          disableEndpoint: fnRef("webhooks:disableEndpoint"),
          removeEndpoint: fnRef("webhooks:removeEndpoint"),
          sendTest: fnRef("webhooks:sendTest"),
          retryDelivery: fnRef("webhooks:retryDelivery"),
          triggerProcessing: fnRef("webhooks:triggerProcessing"),
        }}
      />
    </ConvexPreviewShell>
  );
}
