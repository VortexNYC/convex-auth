---
"@vortex-api/convex-auth": minor
---

Add global-scope webhook endpoint lifecycle operations. `createWebhookEndpoint` accepts org-less (platform-wide) endpoints, but the existing `setWebhookEndpointStatus` / `deleteWebhookEndpoint` require an `organizationId` and fail closed on org-less rows — so global endpoints could be created but never disabled, archived, or deleted.

New component functions mirror the org-scoped set: `listGlobalWebhookEndpoints`, `setGlobalWebhookEndpointStatus`, and `deleteGlobalWebhookEndpoint`. They resolve through a dedicated `requireGlobalWebhookEndpoint` guard that rejects org-scoped endpoints, matching the org ops which already reject org-less ones — each scope fails closed on the other.
