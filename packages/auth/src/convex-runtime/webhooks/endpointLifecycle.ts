import type {
  ConvexWebhookDeliveryStatus,
  ConvexWebhookEndpointStatus,
  ConvexWebhookFailureKind,
} from "./types";

type WebhookEndpointLike = {
  _id: string;
  url: string;
  description?: string;
  eventTypes: string[];
  secret: string;
  status: ConvexWebhookEndpointStatus;
  createdAt: number;
  updatedAt: number;
};

type WebhookDeliveryLike = {
  _id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  payloadJson: string;
  status: ConvexWebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt?: number;
  responseStatus?: number;
  responseBody?: string;
  failureKind?: ConvexWebhookFailureKind;
  deliveredAt?: number;
  exhaustedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type ConvexWebhookEndpointListItem = {
  _id: string;
  url: string;
  description?: string;
  status: ConvexWebhookEndpointStatus;
  eventTypes: string[];
  secretPreview: string;
  createdAt: number;
  updatedAt: number;
};

export type ConvexWebhookDeliveryListItem = {
  _id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  payloadJson: string;
  status: ConvexWebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt?: number;
  responseStatus?: number;
  responseBody?: string;
  failureKind?: ConvexWebhookFailureKind;
  deliveredAt?: number;
  exhaustedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export function normalizeConvexWebhookEndpointUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new Error("Webhook endpoint URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Webhook endpoint URL is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Webhook endpoint URL must start with http:// or https://");
  }
  assertWebhookHostIsDeliverable(parsed.hostname);
  return trimmed;
}

/**
 * SSRF guard. A user with webhook-create permission must not be able to point a
 * delivery at the cloud metadata endpoint (169.254.169.254), loopback, or an
 * internal/private address — that turns the delivery worker into a confused
 * deputy for credential theft and internal port scanning.
 *
 * This blocks LITERAL internal targets (the direct attack). It cannot catch a
 * public DNS name that resolves to an internal IP (DNS rebinding) — that needs
 * resolve-time checking in a Node action and is not possible in the Convex
 * isolate where this validator runs. Deployments that accept untrusted endpoint
 * URLs should additionally pin egress to an allowlist or a forward proxy.
 */
export function assertWebhookHostIsDeliverable(hostname: string): void {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host.length === 0) {
    throw new Error("Webhook endpoint URL must include a host");
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Webhook endpoint URL host is not allowed");
  }
  if (isBlockedIpLiteral(host)) {
    throw new Error("Webhook endpoint URL host is not allowed");
  }
}

function isBlockedIpLiteral(host: string): boolean {
  const ipv4 = parseIpv4(host);
  if (ipv4 !== null) {
    return isBlockedIpv4(ipv4);
  }
  return isBlockedIpv6(host);
}

/**
 * Blocked IPv4 ranges: 0/8 "this network", 127/8 loopback, 10/8 private,
 * 169.254/16 link-local (incl. the 169.254.169.254 cloud metadata endpoint),
 * 172.16/12 private, 192.168/16 private, and 224+/4 multicast + reserved.
 */
function isBlockedIpv4(ipv4: [number, number, number, number]): boolean {
  const [a, b] = ipv4;
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return a >= 224;
}

function isBlockedIpv6(host: string): boolean {
  return (
    isBlockedIpv6SpecialAddress(host) ||
    isBlockedIpv4MappedDottedAddress(host) ||
    isBlockedIpv4MappedHexAddress(host)
  );
}

/**
 * Blocked IPv6 specials: unspecified `::`, loopback `::1`, unique-local
 * `fc00::/7` (fc/fd prefixes), and link-local `fe80::/10` (fe80–feb prefixes).
 */
function isBlockedIpv6SpecialAddress(host: string): boolean {
  if (host === "::" || host === "::1") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  return ["fe80", "fe9", "fea", "feb"].some((prefix) => host.startsWith(prefix));
}

function isBlockedIpv4MappedDottedAddress(host: string): boolean {
  const mappedDotted = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const mappedAddress = mappedDotted?.[1];
  return mappedAddress !== undefined && isBlockedIpLiteral(mappedAddress);
}

function isBlockedIpv4MappedHexAddress(host: string): boolean {
  const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex === null) {
    return false;
  }
  const highText = mappedHex[1];
  const lowText = mappedHex[2];
  if (highText === undefined || lowText === undefined) {
    return false;
  }
  const high = parseInt(highText, 16);
  const low = parseInt(lowText, 16);
  const ipv4 = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
  return isBlockedIpLiteral(ipv4);
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (value > 255) {
      return null;
    }
    octets.push(value);
  }
  const [a, b, c, d] = octets;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return null;
  }
  return [a, b, c, d];
}

export function normalizeConvexWebhookEndpointEventTypes(eventTypes: readonly string[]): string[] {
  const normalized = eventTypes.map((type) => type.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : ["*"];
}

export function createConvexWebhookEndpointListItem(args: {
  endpoint: WebhookEndpointLike;
}): ConvexWebhookEndpointListItem {
  const endpoint = args.endpoint;
  return {
    _id: endpoint._id,
    url: endpoint.url,
    description: endpoint.description ?? undefined,
    status: endpoint.status,
    eventTypes: endpoint.eventTypes,
    secretPreview: getConvexWebhookEndpointSecretPreview(endpoint.secret),
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export function createConvexWebhookDeliveryListItem(args: {
  delivery: WebhookDeliveryLike;
}): ConvexWebhookDeliveryListItem {
  const delivery = args.delivery;
  return {
    _id: delivery._id,
    endpointId: delivery.endpointId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    payloadJson: delivery.payloadJson,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt ?? undefined,
    responseStatus: delivery.responseStatus ?? undefined,
    responseBody: delivery.responseBody ?? undefined,
    failureKind: delivery.failureKind ?? undefined,
    deliveredAt: delivery.deliveredAt ?? undefined,
    exhaustedAt: delivery.exhaustedAt ?? undefined,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

export function getConvexWebhookEndpointSecretPreview(secret: string): string {
  if (secret.length >= 16) {
    return `${secret.slice(0, 10)}...${secret.slice(-6)}`;
  }
  return `${secret.slice(0, 3)}...`;
}

export type WebhookEndpointActiveDecision =
  | {
      active: true;
      endpointId: string;
    }
  | {
      active: false;
      endpointId: string;
      reason: "archived" | "disabled" | "endpoint_not_found";
    };

export function checkWebhookEndpointActive(args: {
  endpoint: { _id: string; status: ConvexWebhookEndpointStatus } | null;
}): WebhookEndpointActiveDecision {
  const endpoint = args.endpoint;
  if (endpoint === null) {
    return { active: false, endpointId: "", reason: "endpoint_not_found" };
  }
  if (endpoint.status === "archived") {
    return { active: false, endpointId: endpoint._id, reason: "archived" };
  }
  if (endpoint.status === "disabled") {
    return { active: false, endpointId: endpoint._id, reason: "disabled" };
  }
  return { active: true, endpointId: endpoint._id };
}

export function requireWebhookEndpointActive(args: {
  endpoint: { _id: string; status: ConvexWebhookEndpointStatus } | null;
}): { endpointId: string } {
  const decision = checkWebhookEndpointActive(args);
  if (!decision.active) {
    throw new Error(`Webhook endpoint is not active: ${decision.reason}`);
  }
  return { endpointId: decision.endpointId };
}

export function classifyWebhookEndpointStatusTransition(args: {
  from: ConvexWebhookEndpointStatus;
  to: ConvexWebhookEndpointStatus;
}): { ok: true } | { ok: false; reason: string } {
  const { from, to } = args;
  if (from === to) {
    return { ok: true };
  }
  const validTransitions: Record<
    ConvexWebhookEndpointStatus,
    readonly ConvexWebhookEndpointStatus[]
  > = {
    active: ["disabled", "archived"],
    disabled: ["active", "archived"],
    archived: ["active", "disabled"],
  };
  if (validTransitions[from].includes(to)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Invalid webhook endpoint status transition from ${from} to ${to}`,
  };
}
