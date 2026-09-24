import assert from "node:assert/strict";

import { convexTest } from "convex-test";
import { describe, it } from "vitest";

import { api } from "./component/_generated/api";
import type { Id } from "./component/_generated/dataModel";
import schema from "./component/schema";

const modules = {
  "./component/_generated/api.ts": () => import("./component/_generated/api"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel"),
  "./component/_generated/server.ts": () => import("./component/_generated/server"),
  "./component/apiKeys.ts": () => import("./component/apiKeys"),
  "./component/identity.ts": () => import("./component/identity"),
  "./component/organizations.ts": () => import("./component/organizations"),
  "./component/servicePrincipals.ts": () => import("./component/servicePrincipals"),
  "./component/status.ts": () => import("./component/status"),
  "./component/webhooks.ts": () => import("./component/webhooks"),
};

function only<T>(values: readonly T[], message: string): T {
  const [value] = values;
  assert.ok(value !== undefined, message);
  return value;
}

async function createEndpoint(
  t: ReturnType<typeof convexTest>,
  args: {
    organizationId?: Id<"organizations">;
    eventTypes: string[];
    url?: string;
  },
): Promise<Id<"webhook_endpoints">> {
  const { endpointId } = await t.mutation(api.webhooks.createWebhookEndpoint, {
    organizationId: args.organizationId,
    url: args.url ?? "https://example.test/hook",
    eventTypes: args.eventTypes,
    secret: "whsec_test_secret_value_123456",
  });
  return endpointId;
}

describe("enqueueWebhookEvent firing helper", () => {
  it("enqueues one pending delivery per subscribed active endpoint", async () => {
    const t = convexTest(schema, modules);
    const subscribed = await createEndpoint(t, {
      eventTypes: ["user.created", "user.updated"],
    });
    const wildcard = await createEndpoint(t, {
      eventTypes: ["*"],
      url: "https://example.test/wildcard",
    });
    await createEndpoint(t, {
      eventTypes: ["organization.created"],
      url: "https://example.test/other",
    });

    const result = await t.mutation(api.webhooks.enqueueWebhookEvent, {
      eventType: "user.created",
      eventId: "evt_user_created_1",
      payloadJson: '{"id":"evt_user_created_1"}',
    });

    assert.equal(result.enqueued, 2);
    assert.equal(result.deliveryIds.length, 2);

    const subscribedDeliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, {
      endpointId: subscribed,
    });
    assert.equal(subscribedDeliveries.length, 1);
    const subscribedDelivery = only(subscribedDeliveries, "subscribed delivery is missing");
    assert.equal(subscribedDelivery.status, "pending");
    assert.equal(subscribedDelivery.eventType, "user.created");
    assert.equal(subscribedDelivery.attemptCount, 0);

    const wildcardDeliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, {
      endpointId: wildcard,
    });
    assert.equal(wildcardDeliveries.length, 1);
  });

  it("skips endpoints not subscribed to the event type", async () => {
    const t = convexTest(schema, modules);
    await createEndpoint(t, { eventTypes: ["organization.created"] });

    const result = await t.mutation(api.webhooks.enqueueWebhookEvent, {
      eventType: "user.deleted",
      eventId: "evt_user_deleted_1",
      payloadJson: "{}",
    });

    assert.equal(result.enqueued, 0);
    assert.equal(result.deliveryIds.length, 0);
  });

  it("skips inactive endpoints", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Inactive Test Org",
      slug: `inactive-test-${crypto.randomUUID()}`,
    });
    const endpointId = await createEndpoint(t, {
      organizationId,
      eventTypes: ["user.created"],
    });
    await t.mutation(api.webhooks.setWebhookEndpointStatus, {
      organizationId,
      endpointId,
      status: "disabled",
    });

    const result = await t.mutation(api.webhooks.enqueueWebhookEvent, {
      eventType: "user.created",
      eventId: "evt_user_created_2",
      payloadJson: "{}",
    });

    assert.equal(result.enqueued, 0);
  });

  it("claimWebhookDelivery atomically claims a pending row exactly once", async () => {
    const t = convexTest(schema, modules);
    await createEndpoint(t, { eventTypes: ["user.created"] });
    const { deliveryIds } = await t.mutation(api.webhooks.enqueueWebhookEvent, {
      eventType: "user.created",
      eventId: "evt_claim_1",
      payloadJson: "{}",
    });
    const deliveryId = only(deliveryIds, "enqueued delivery ID is missing");

    const first = await t.mutation(api.webhooks.claimWebhookDelivery, {
      deliveryId,
    });
    assert.equal(first.claimed, true);

    const afterClaim = await t.query(api.webhooks.getWebhookDelivery, {
      deliveryId,
    });
    assert.equal(afterClaim?.status, "processing");

    /*
     * A second worker that already lost the race must not re-claim it — this is
     * what prevents the same delivery being sent twice.
     */
    const second = await t.mutation(api.webhooks.claimWebhookDelivery, {
      deliveryId,
    });
    assert.equal(second.claimed, false);
  });

  it("returns pending deliveries via listPendingWebhookDeliveries for the processor", async () => {
    const t = convexTest(schema, modules);
    await createEndpoint(t, { eventTypes: ["member.added"] });

    await t.mutation(api.webhooks.enqueueWebhookEvent, {
      eventType: "member.added",
      eventId: "evt_member_added_1",
      payloadJson: "{}",
      createdAt: 1_700_000_000_000,
    });

    const pending = await t.query(api.webhooks.listPendingWebhookDeliveries, {
      beforeNextAttemptAt: 1_700_000_001_000,
    });
    assert.equal(pending.length, 1);
    const pendingDelivery = only(pending, "pending delivery is missing");
    assert.equal(pendingDelivery.eventType, "member.added");
    assert.equal(pendingDelivery.status, "pending");
  });

  it("global event (no organizationId) reaches only global endpoints, not tenant endpoints", async () => {
    const t = convexTest(schema, modules);
    const globalEndpoint = await createEndpoint(t, {
      eventTypes: ["user.created"],
    });
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Tenant Org",
      slug: `tenant-org-${crypto.randomUUID()}`,
    });
    const tenantEndpoint = await createEndpoint(t, {
      organizationId,
      eventTypes: ["user.created"],
    });

    /* Fire without organizationId — a global/system event. */
    const result = await t.mutation(api.webhooks.enqueueWebhookEvent, {
      eventType: "user.created",
      eventId: "evt_global_only_1",
      payloadJson: "{}",
    });

    /* Only the global endpoint should receive the delivery. */
    assert.equal(result.enqueued, 1);
    assert.equal(result.deliveryIds.length, 1);

    const globalDeliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, {
      endpointId: globalEndpoint,
    });
    assert.equal(globalDeliveries.length, 1);

    const tenantDeliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, {
      endpointId: tenantEndpoint,
    });
    assert.equal(tenantDeliveries.length, 0);
  });

  it("org-scoped event reaches both org and global endpoints", async () => {
    const t = convexTest(schema, modules);
    const globalEndpoint = await createEndpoint(t, {
      eventTypes: ["member.added"],
    });
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Scoped Org",
      slug: `scoped-org-${crypto.randomUUID()}`,
    });
    const orgEndpoint = await createEndpoint(t, {
      organizationId,
      eventTypes: ["member.added"],
    });

    const result = await t.mutation(api.webhooks.enqueueWebhookEvent, {
      eventType: "member.added",
      eventId: "evt_scoped_1",
      payloadJson: "{}",
      organizationId,
    });

    /* Both global and org-scoped endpoints should receive deliveries. */
    assert.equal(result.enqueued, 2);
    assert.equal(result.deliveryIds.length, 2);

    const globalDeliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, {
      endpointId: globalEndpoint,
    });
    assert.equal(globalDeliveries.length, 1);

    const orgDeliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, {
      endpointId: orgEndpoint,
    });
    assert.equal(orgDeliveries.length, 1);
  });
});

async function createUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      emailVerified: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function singleDeliveryEventType(
  t: ReturnType<typeof convexTest>,
  endpointId: Id<"webhook_endpoints">,
): Promise<string> {
  const deliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, { endpointId });
  assert.equal(deliveries.length, 1, "expected exactly one enqueued delivery");
  const delivery = only(deliveries, "enqueued delivery is missing");
  assert.equal(delivery.status, "pending");
  return delivery.eventType;
}

describe("organization mutations emit canonical webhook events", () => {
  it("upsertOrganization fires organization.created to a global (cache) subscriber", async () => {
    const t = convexTest(schema, modules);
    /*
     * A platform/cache subscriber registers a GLOBAL endpoint (no organizationId)
     * and receives org-scoped events for every org — this is how a consumer
     * hydrates a one-way org/member read-cache, and the only way to catch
     * organization.created (whose org id cannot be subscribed to before it exists).
     */
    const endpointId = await createEndpoint(t, {
      eventTypes: ["organization.created"],
    });

    const created = await t.mutation(api.organizations.upsertOrganization, {
      name: "Acme",
      slug: "acme",
    });
    assert.equal(created.created, true);

    assert.equal(await singleDeliveryEventType(t, endpointId), "organization.created");
  });
});

describe("organization scoped webhook subscribers receive canonical events", () => {
  it("a global subscriber also receives org-scoped member events", async () => {
    const t = convexTest(schema, modules);
    const globalEndpoint = await createEndpoint(t, { eventTypes: ["*"] });

    const org = await t.mutation(api.organizations.upsertOrganization, {
      name: "Globex",
      slug: "globex",
    });
    const roleId = (
      await t.mutation(api.organizations.ensureRole, {
        organizationId: org.organizationId,
        key: "member",
        name: "member",
        permissions: [],
        isSystem: true,
      })
    ).roleId;
    const userId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("users", {
        email: "g@example.test",
        emailVerified: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(api.organizations.upsertMember, {
      organizationId: org.organizationId,
      userId,
      roleId,
      status: "active",
    });

    /* The wildcard global endpoint caught organization.created + member.added. */
    const deliveries = await t.query(api.webhooks.listWebhookDeliveriesByEndpoint, {
      endpointId: globalEndpoint,
    });
    const types = deliveries.map((d) => d.eventType).toSorted();
    assert.deepEqual(types, ["member.added", "organization.created"]);
  });

  it("upsertOrganization fires organization.updated when an existing org is patched", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.organizations.upsertOrganization, {
      name: "Theta",
      slug: "theta",
    });
    const endpointId = await createEndpoint(t, {
      organizationId: created.organizationId,
      eventTypes: ["organization.updated"],
    });

    await t.mutation(api.organizations.upsertOrganization, {
      organizationId: created.organizationId,
      name: "Theta Renamed",
      slug: "theta",
    });

    assert.equal(await singleDeliveryEventType(t, endpointId), "organization.updated");
  });
});

describe("organization member mutations emit canonical webhook events", () => {
  it("upsertMember fires member.added when a member is created", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Beta",
      slug: "beta",
    });
    const { roleId } = await t.mutation(api.organizations.ensureRole, {
      organizationId,
      key: "member",
      name: "Member",
      permissions: ["organization:read"],
    });
    const userId = await createUser(t);
    const endpointId = await createEndpoint(t, {
      organizationId,
      eventTypes: ["member.added"],
    });

    await t.mutation(api.organizations.upsertMember, {
      organizationId,
      userId,
      roleId,
    });

    assert.equal(await singleDeliveryEventType(t, endpointId), "member.added");
  });

  it("setMemberRole fires member.role_changed", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Gamma",
      slug: "gamma",
    });
    const { roleId } = await t.mutation(api.organizations.ensureRole, {
      organizationId,
      key: "member",
      name: "Member",
      permissions: ["organization:read"],
    });
    const { roleId: ownerRoleId } = await t.mutation(api.organizations.ensureRole, {
      organizationId,
      key: "owner",
      name: "Owner",
      permissions: ["*"],
    });
    const userId = await createUser(t);
    const { memberId } = await t.mutation(api.organizations.upsertMember, {
      organizationId,
      userId,
      roleId,
    });
    const endpointId = await createEndpoint(t, {
      organizationId,
      eventTypes: ["member.role_changed"],
    });

    await t.mutation(api.organizations.setMemberRole, {
      organizationId,
      memberId,
      roleId: ownerRoleId,
    });

    assert.equal(await singleDeliveryEventType(t, endpointId), "member.role_changed");
  });
});

describe("organization invitation mutations emit canonical webhook events", () => {
  it("upsertInvitation fires invitation.created on insert", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Delta",
      slug: "delta",
    });
    const { roleId } = await t.mutation(api.organizations.ensureRole, {
      organizationId,
      key: "member",
      name: "Member",
      permissions: ["organization:read"],
    });
    const invitedBy = await createUser(t);
    const endpointId = await createEndpoint(t, {
      organizationId,
      eventTypes: ["invitation.created"],
    });

    await t.mutation(api.organizations.upsertInvitation, {
      organizationId,
      roleId,
      email: "invitee@example.test",
      tokenHash: "token_hash_value_1",
      invitedBy,
      expiresAt: Date.now() + 1_000_000,
    });

    assert.equal(await singleDeliveryEventType(t, endpointId), "invitation.created");
  });

  it("redeemInvitation fires invitation.accepted and member.added", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Epsilon",
      slug: "epsilon",
    });
    const { roleId } = await t.mutation(api.organizations.ensureRole, {
      organizationId,
      key: "member",
      name: "Member",
      permissions: ["organization:read"],
    });
    const invitedBy = await createUser(t);
    const acceptedByUserId = await createUser(t);
    await t.mutation(api.organizations.upsertInvitation, {
      organizationId,
      roleId,
      email: "redeemer@example.test",
      tokenHash: "token_hash_value_2",
      invitedBy,
      expiresAt: Date.now() + 1_000_000,
    });
    const acceptedEndpoint = await createEndpoint(t, {
      organizationId,
      eventTypes: ["invitation.accepted"],
      url: "https://example.test/accepted",
    });
    const memberAddedEndpoint = await createEndpoint(t, {
      organizationId,
      eventTypes: ["member.added"],
      url: "https://example.test/member-added",
    });

    await t.mutation(api.organizations.redeemInvitation, {
      tokenHash: "token_hash_value_2",
      acceptedByUserId,
    });

    assert.equal(await singleDeliveryEventType(t, acceptedEndpoint), "invitation.accepted");
    assert.equal(await singleDeliveryEventType(t, memberAddedEndpoint), "member.added");
  });
});
