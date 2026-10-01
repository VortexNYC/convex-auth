import { ConvexWebhookCreateForm } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_EVENT_OPTIONS } from "./_shared";

export default function WebhookCreateFormPreview() {
  return (
    <ConvexWebhookCreateForm
      creating={false}
      enabled
      eventOptions={MOCK_WEBHOOK_EVENT_OPTIONS}
      state={{
        url: "https://api.example.com/webhooks/convex-auth",
        description: "",
        events: ["user.created"],
      }}
      onUrlChange={() => {}}
      onDescriptionChange={() => {}}
      onEventsChange={() => {}}
      onSubmit={() => {}}
    />
  );
}
