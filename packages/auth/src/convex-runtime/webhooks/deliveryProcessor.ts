/**
 * Turnkey webhook delivery processing.
 *
 * Packages the per-delivery firing logic a consumer hand-wired
 * (`convex/webhookDeliveries.ts::processPendingDelivery`) into a single
 * reusable async function so a consumer's `internalAction` body shrinks to a
 * few lines. The package owns signing + classification + the result-update
 * shape; the consumer still owns the runtime seam (`fetch`), the persistence
 * mutations, and mounting the cron — per `docs/webhook-delivery-queue-recipe.md`.
 */
import {
  classifyInactiveConvexWebhookEndpointOutcome,
  classifyConvexWebhookExecutionError,
  classifyConvexWebhookHttpResult,
} from "./deliveryOutcome";
import {
  buildConvexWebhookDeliveryResultUpdate,
  type ConvexWebhookDeliveryResultInput,
  type ConvexWebhookDeliveryResultUpdate,
} from "./deliveryState";
import { assertWebhookHostIsDeliverable } from "./endpointLifecycle";
import type { ConvexWebhookRetryPolicyOptions } from "./retryPolicy";
import { createConvexWebhookHeaders, signConvexWebhookPayload } from "./signing";
import type { ConvexWebhookEndpointStatus } from "./types";

export const DEFAULT_WEBHOOK_MAX_ATTEMPTS = 4;
export const DEFAULT_WEBHOOK_PROCESSING_LIMIT = 10;
export const DEFAULT_WEBHOOK_STALE_AFTER_MS = 5 * 60 * 1000;

export type ConvexWebhookProcessorEndpoint = {
  _id: string;
  url: string;
  secret: string;
  status: ConvexWebhookEndpointStatus;
};

export type ConvexWebhookProcessorDelivery = {
  _id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  payloadJson: string;
  attemptCount: number;
  deliveredAt?: number;
  processingScheduledAt?: number;
};

/** Minimal `fetch`-like seam the consumer supplies from their action runtime. */
export type ConvexWebhookFetchResponse = {
  status: number;
  text: () => Promise<string>;
};

export type ConvexWebhookFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<ConvexWebhookFetchResponse>;

export type ProcessConvexWebhookDeliveryArgs = {
  endpoint: ConvexWebhookProcessorEndpoint | null;
  delivery: ConvexWebhookProcessorDelivery;
  fetch: ConvexWebhookFetch;
  now?: number;
  maxAttempts?: number;
  /** Header prefix for `x-<prefix>-signature` etc. Defaults to `convex`. */
  headerPrefix?: string;
  retryOptions?: ConvexWebhookRetryPolicyOptions;
};

export type ProcessConvexWebhookDeliveryResult = {
  outcome: ConvexWebhookDeliveryResultInput;
  update: ConvexWebhookDeliveryResultUpdate;
};

/**
 * Sign, POST, and classify a single delivery, returning both the classified
 * outcome and the ready-to-persist `updateWebhookDelivery` patch.
 *
 * The consumer claims the row (mark `processing`) before calling this and
 * persists `result.update` after, scheduling a retry when
 * `result.update.status === "pending"`. Inactive/missing endpoints terminate
 * without a network attempt.
 */
export async function processConvexWebhookDelivery(
  args: ProcessConvexWebhookDeliveryArgs,
): Promise<ProcessConvexWebhookDeliveryResult> {
  const now = args.now ?? Date.now();
  const maxAttempts = args.maxAttempts ?? DEFAULT_WEBHOOK_MAX_ATTEMPTS;
  const attemptCount = args.delivery.attemptCount + 1;
  const deliveryKey = `${args.delivery.endpointId}:${args.delivery.eventId}:${args.delivery._id}`;

  const finalize = (
    outcome: ConvexWebhookDeliveryResultInput,
  ): ProcessConvexWebhookDeliveryResult => ({
    outcome,
    update: buildConvexWebhookDeliveryResultUpdate({
      delivery: {
        attemptCount: args.delivery.attemptCount,
        deliveredAt: args.delivery.deliveredAt,
        processingScheduledAt: args.delivery.processingScheduledAt,
      },
      outcome,
      now,
      deliveryKey,
      retryOptions: args.retryOptions,
    }),
  });

  const endpoint = args.endpoint;
  if (endpoint === null || endpoint.status !== "active") {
    return finalize(classifyInactiveConvexWebhookEndpointOutcome());
  }

  try {
    // SSRF chokepoint: every delivery passes here, so a stored internal/loopback
    // target (however it got persisted) can never actually be fetched. Throws →
    // routed through the catch below as an execution failure.
    assertWebhookHostIsDeliverable(new URL(endpoint.url).hostname);
    const signature = await signConvexWebhookPayload(endpoint.secret, args.delivery.payloadJson);
    const response = await args.fetch(endpoint.url, {
      method: "POST",
      headers: createConvexWebhookHeaders({
        deliveryId: args.delivery.eventId,
        eventType: args.delivery.eventType,
        prefix: args.headerPrefix,
        signature,
      }),
      body: args.delivery.payloadJson,
    });

    return finalize(
      classifyConvexWebhookHttpResult({
        statusCode: response.status,
        responseBody: await response.text(),
        attemptCount,
        maxAttempts,
      }),
    );
  } catch (error) {
    return finalize(
      classifyConvexWebhookExecutionError({
        message: error instanceof Error ? error.message : "Webhook delivery failed",
        attemptCount,
        maxAttempts,
      }),
    );
  }
}
