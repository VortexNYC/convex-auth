/**
 * SSR smoke coverage for `ConvexOrganizationProfile`.
 *
 * The Convex-owned organization settings panel — display + edit
 * org metadata, surface status, expose delete. Until now: zero direct
 * coverage.
 *
 * Contract:
 *   1. returns null (renders nothing) when `organization` is undefined
 *   2. renders the org name + slug when an org is provided
 *   3. surfaces "active" vs "suspended" status via the corresponding copy
 *   4. `classNames.card` composes into the outer card element
 *   5. `copy.title` overrides the default
 *   6. an edit button is rendered when `onUpdate` is wired
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  ConvexOrganizationProfile,
  type ConvexOrgProfileOrganization,
  type ConvexOrgProfileProps,
} from "./organization-profile";

const noop = async () => {};

function render(props: ConvexOrgProfileProps): string {
  return renderToStaticMarkup(createElement(ConvexOrganizationProfile, props));
}

const activeOrg: ConvexOrgProfileOrganization = {
  _id: "org_acme",
  name: "Acme Pizza",
  slug: "acme-pizza",
  status: "active",
};

const suspendedOrg: ConvexOrgProfileOrganization = {
  _id: "org_beta",
  name: "Beta Bakery",
  slug: "beta-bakery",
  status: "suspended",
};

describe("ConvexOrganizationProfile — SSR smoke", () => {
  it("returns null when no organization is provided", () => {
    const html = render({ organization: undefined });
    assert.equal(html, "");
  });

  it("renders the org name and slug", () => {
    const html = render({ organization: activeOrg });
    assert.match(html, /Acme Pizza/);
    assert.match(html, /acme-pizza/);
  });

  it("surfaces 'active' status copy", () => {
    const html = render({
      organization: activeOrg,
      copy: { activeStatus: "Active workspace ✓" },
    });
    assert.match(html, /Active workspace ✓/);
  });

  it("surfaces 'suspended' status copy", () => {
    const html = render({
      organization: suspendedOrg,
      copy: { suspendedStatus: "Suspended workspace !" },
    });
    assert.match(html, /Suspended workspace !/);
  });

  it("composes `classNames.card` into the outer card", () => {
    const html = render({
      organization: activeOrg,
      classNames: { card: "consumer-org-card" },
    });
    assert.match(html, /consumer-org-card/);
  });

  it("renders an edit button when isAdmin + onUpdate are wired", () => {
    // The edit/delete actions section is gated on isAdmin — non-admins
    // see a read-only view. Verify the admin path surfaces the edit copy.
    const html = render({
      organization: activeOrg,
      isAdmin: true,
      onUpdate: noop,
      copy: { editLabel: "EDIT_ME" },
    });
    assert.match(html, /EDIT_ME/);
  });

  it("does NOT render the edit button when isAdmin is false (read-only path)", () => {
    const html = render({
      organization: activeOrg,
      isAdmin: false,
      onUpdate: noop,
      copy: { editLabel: "SHOULD_NOT_APPEAR" },
    });
    assert.equal(html.includes("SHOULD_NOT_APPEAR"), false);
  });

  it("renders suite brand fields by default (VOR-182)", () => {
    const html = render({
      organization: {
        ...activeOrg,
        brand: {
          primaryColor: "#0F172A",
          website: "https://acme.example",
        },
      },
      copy: {
        brandSectionTitle: "BRAND_SECTION",
        primaryColorLabel: "PRIMARY_COLOR",
      },
    });
    assert.match(html, /BRAND_SECTION/);
    assert.match(html, /PRIMARY_COLOR/);
    assert.match(html, /#0F172A/);
    assert.match(html, /https:\/\/acme\.example/);
  });

  it("hides brand fields when showBrandFields is false", () => {
    const html = render({
      organization: {
        ...activeOrg,
        brand: { primaryColor: "#0F172A" },
      },
      showBrandFields: false,
      copy: { brandSectionTitle: "BRAND_SHOULD_HIDE" },
    });
    assert.equal(html.includes("BRAND_SHOULD_HIDE"), false);
    assert.equal(html.includes("#0F172A"), false);
  });

  it("renders suite security fields by default (VOR-183)", () => {
    const html = render({
      organization: {
        ...activeOrg,
        security: { requireMfa: true, sessionTimeoutMinutes: 120 },
      },
      copy: {
        securitySectionTitle: "SECURITY_SECTION",
        requireMfaEnabled: "MFA_ON",
      },
    });
    assert.match(html, /SECURITY_SECTION/);
    assert.match(html, /MFA_ON/);
    assert.match(html, /120/);
  });

  it("hides security fields when showSecurityFields is false", () => {
    const html = render({
      organization: {
        ...activeOrg,
        security: { requireMfa: true },
      },
      showSecurityFields: false,
      copy: { securitySectionTitle: "SECURITY_SHOULD_HIDE" },
    });
    assert.equal(html.includes("SECURITY_SHOULD_HIDE"), false);
  });
});
