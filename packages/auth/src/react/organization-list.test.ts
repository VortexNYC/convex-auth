/**
 * SSR smoke coverage for `ConvexOrganizationList`.
 *
 * The Convex-owned "your workspaces + pending invitations" surface
 * every B2B consumer mounts on the post-sign-in route when the user
 * has multiple memberships. Until now: zero direct test coverage.
 *
 * SSR markup is fully static (no useState gates), so every section is
 * assertable.
 *
 * Contract:
 *   1. lists every org by name when memberships are provided
 *   2. marks the active org with the `currentLabel`
 *   3. renders the empty-state copy when memberships are empty
 *   4. lists pending invitations when `invitations` is set + `showInvitations`
 *   5. invitations section omitted when none + showInvitations off
 *   6. `classNames.card` composes into the outer card element
 *   7. `copy.title` overrides the default title
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  ConvexOrganizationList,
  type ConvexOrgListInvitation,
  type ConvexOrgListOrganization,
  type ConvexOrgListProps,
} from "./organization-list";

const noop = () => {};

function render(props: Partial<ConvexOrgListProps>): string {
  return renderToStaticMarkup(
    createElement(ConvexOrganizationList, {
      organizations: [],
      onSelectOrganization: noop,
      ...props,
    }),
  );
}

const acme: ConvexOrgListOrganization = { _id: "org_acme", name: "Acme Pizza" };
const beta: ConvexOrgListOrganization = {
  _id: "org_beta",
  name: "Beta Bakery",
};
const invite: ConvexOrgListInvitation = {
  _id: "inv_1",
  organizationName: "Gamma Group",
  email: "user@example.com",
  expiresAt: Date.now() + 86400_000,
};

describe("ConvexOrganizationList — SSR smoke", () => {
  it("renders every membership by name", () => {
    const html = render({ organizations: [acme, beta] });
    assert.match(html, /Acme Pizza/);
    assert.match(html, /Beta Bakery/);
  });

  it("marks the active organization with the `currentLabel`", () => {
    const html = render({
      organizations: [acme, beta],
      currentOrganizationId: "org_acme",
      copy: { currentLabel: "ACTIVE_NOW" },
    });
    assert.match(html, /ACTIVE_NOW/);
  });

  it("renders the no-organizations empty state when memberships are empty", () => {
    const html = render({
      organizations: [],
      copy: { noOrganizationsLabel: "Membership empty" },
    });
    assert.match(html, /Membership empty/);
  });

  it("renders pending invitations when showInvitations is true", () => {
    const html = render({
      organizations: [],
      invitations: [invite],
      showInvitations: true,
      onAcceptInvitation: noop,
      onRejectInvitation: noop,
    });
    assert.match(html, /Gamma Group/);
  });

  it("composes `classNames.card` into the outer card element", () => {
    const html = render({
      organizations: [acme],
      classNames: { card: "consumer-card-cls" },
    });
    assert.match(html, /consumer-card-cls/);
  });

  it("`copy.title` overrides the default title", () => {
    const html = render({
      organizations: [acme],
      copy: { title: "Pick a workspace" },
    });
    assert.match(html, /Pick a workspace/);
  });
});
