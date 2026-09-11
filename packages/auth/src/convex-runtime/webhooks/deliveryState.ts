import { getConvexWebhookRetryAt, type ConvexWebhookRetryPolicyOptions } from "./retryPolicy";
import type { ConvexWebhookFailureKind } from "./types";

export type ConvexWebhookDeliveryResultDelivery = {
  attemptCount: number;
  deliveredAt?: number;
  processingScheduledAt?: number;
};

export type ConvexWebhookDeliveryResultUpdate = {
  status: "pending" | "delivered" | "failed";
  attemptCount: number;
  nextAttemptAt?: number | null;
  responseStatus?: number | null;
  responseBody?: string | null;
  failureKind?: ConvexWebhookFailureKind | null;
  deliveredAt?: number | null;
  exhaustedAt?: number | null;
  updatedAt: number;
};

export type ConvexWebhookDeliveryResultInput = {
  status: "pending" | "delivered" | "failed";
  responseStatus?: number;
  responseBody?: string;
  failureKind?: ConvexWebhookFailureKind;
};

export function buildConvexWebhookDeliveryResultUpdate(args: {
  delivery: ConvexWebhookDeliveryResultDelivery;
  outcome: ConvexWebhookDeliveryResultInput;
  now: number;
  deliveryKey: string;
  retryOptions?: ConvexWebhookRetryPolicyOptions;
}): ConvexWebhookDeliveryResultUpdate {
  const attemptCount = args.delivery.attemptCount + 1;
  const nextAttemptAt =
    args.outcome.status === "pending"
      ? getConvexWebhookRetryAt({
          attemptCount,
          now: args.now,
          deliveryKey: args.deliveryKey,
          options: args.retryOptions,
        })
      : null;

  return {
    status: args.outcome.status,
    attemptCount,
    nextAttemptAt,
    responseStatus: args.outcome.responseStatus ?? null,
    responseBody: args.outcome.responseBody ?? null,
    failureKind: args.outcome.failureKind ?? null,
    deliveredAt:
      args.outcome.status === "delivered" ? args.now : (args.delivery.deliveredAt ?? null),
    exhaustedAt: args.outcome.status === "failed" ? args.now : null,
    updatedAt: args.now,
  };
}

export type ConvexWebhookStaleDelivery = {
  recoveryCount?: number;
};

export type ConvexWebhookStaleDeliveryUpdate = {
  status: "pending";
  nextAttemptAt: number;
  updatedAt: number;
  recoveredAt: number;
  recoveryCount: number;
  responseBody: string;
  failureKind?: ConvexWebhookFailureKind | null;
  responseStatus?: number | null;
  deliveredAt?: number | null;
  exhaustedAt?: number | null;
};

export function buildConvexWebhookStaleDeliveryUpdate(args: {
  delivery: ConvexWebhookStaleDelivery;
  now: number;
  responseBody?: string;
}): ConvexWebhookStaleDeliveryUpdate {
  return {
    status: "pending",
    nextAttemptAt: args.now,
    updatedAt: args.now,
    recoveredAt: args.now,
    recoveryCount: (args.delivery.recoveryCount ?? 0) + 1,
    responseBody: args.responseBody ?? "Recovered stale processing delivery for retry",
    failureKind: null,
    responseStatus: null,
    deliveredAt: null,
    exhaustedAt: null,
  };
}
