import { useState } from "react";
import { ConvexWebhookCreateForm } from "../../packages/auth/src/react/webhooks";
import { MOCK_WEBHOOK_EVENT_OPTIONS } from "./_shared";

export default function WebhookCreateFormPreview() {
  const [state, setState] = useState({
    url: "https://api.example.com/webhooks/convex-auth",
    description: "",
    events: ["user.created"],
  });
  return (
    <ConvexWebhookCreateForm
      creating={false}
      enabled
      eventOptions={MOCK_WEBHOOK_EVENT_OPTIONS}
      state={state}
      onUrlChange={(url) => setState((s) => ({ ...s, url }))}
      onDescriptionChange={(description) => setState((s) => ({ ...s, description }))}
      onEventsChange={(events) => setState((s) => ({ ...s, events }))}
      onSubmit={() => {}}
    />
  );
}
