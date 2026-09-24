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

describe("listWebhookEndpointsByOrganization", () => {
  it("returns endpoints scoped to the given organization", async () => {
    const t = convexTest(schema, modules);
    const { organizationId: orgA } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Org A",
      slug: "org-a",
    });
    const { organizationId: orgB } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Org B",
      slug: "org-b",
    });

    const endpointA = await createEndpoint(t, {
      organizationId: orgA,
      eventTypes: ["user.created"],
    });
    const endpointB = await createEndpoint(t, {
      organizationId: orgB,
      eventTypes: ["member.added"],
    });

    const listA = await t.query(api.webhooks.listWebhookEndpointsByOrganization, {
      organizationId: orgA,
    });
    assert.equal(listA.length, 1);
    assert.equal(only(listA, "organization A endpoint is missing")._id, endpointA);

    const listB = await t.query(api.webhooks.listWebhookEndpointsByOrganization, {
      organizationId: orgB,
    });
    assert.equal(listB.length, 1);
    assert.equal(only(listB, "organization B endpoint is missing")._id, endpointB);
  });

  it("respects the limit argument", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Limited Org",
      slug: "limited-org",
    });

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createEndpoint(t, {
          organizationId,
          eventTypes: ["user.created"],
          url: `https://example.test/hook-${i}`,
        }),
      ),
    );

    const list = await t.query(api.webhooks.listWebhookEndpointsByOrganization, {
      organizationId,
      limit: 3,
    });
    assert.equal(list.length, 3);
  });

  it("filters by status when provided", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.mutation(api.organizations.upsertOrganization, {
      name: "Status Org",
      slug: "status-org",
    });

    const activeEndpoint = await createEndpoint(t, {
      organizationId,
      eventTypes: ["user.created"],
    });
    const disabledEndpoint = await createEndpoint(t, {
      organizationId,
      eventTypes: ["member.added"],
      url: "https://example.test/disabled",
    });
    await t.mutation(api.webhooks.setWebhookEndpointStatus, {
      organizationId,
      endpointId: disabledEndpoint,
      status: "disabled",
    });

    const activeList = await t.query(api.webhooks.listWebhookEndpointsByOrganization, {
      organizationId,
      status: "active",
    });
    assert.equal(activeList.length, 1);
    assert.equal(only(activeList, "active webhook endpoint is missing")._id, activeEndpoint);

    const allList = await t.query(api.webhooks.listWebhookEndpointsByOrganization, {
      organizationId,
    });
    assert.equal(allList.length, 2);
  });
});
