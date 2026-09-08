/**
 * SSR smoke coverage for `ConvexOrganizationSwitcher`.
 *
 * The Convex-owned org switcher every B2B consumer wires into
 * their app shell. SSR markup covers the closed (trigger-only) state,
 * which is what users see on first paint.
 *
 * Contract:
 *  1. trigger renders with the current org name when one is active
 *  2. trigger falls back to a "no organizations" placeholder when the
 *     viewer has no active org
 *  3. trigger shows an `<img>` when current org has `imageUrl`
 *  4. trigger shows the org's first-letter placeholder when no imageUrl
 *  5. `classNames.trigger` is composed into the trigger element
 *  6. `aria-haspopup="menu"` + `aria-expanded="false"` are emitted —
 *     accessibility contract for the dropdown trigger
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  ConvexOrganizationSwitcher,
  type ConvexOrgSwitcherOrganization,
  type ConvexOrgSwitcherProps,
} from "./organization-switcher";

const noop = () => {};

function render(props: Partial<ConvexOrgSwitcherProps>): string {
  return renderToStaticMarkup(
    createElement(ConvexOrganizationSwitcher, {
      organizations: [],
      onSelectOrganization: noop,
      ...props,
    }),
  );
}

const acme: ConvexOrgSwitcherOrganization = {
  _id: "org_acme",
  name: "Acme Pizza",
  imageUrl: "https://example.com/acme.png",
};

const beta: ConvexOrgSwitcherOrganization = {
  _id: "org_beta",
  name: "Beta Bakery",
};

describe("ConvexOrganizationSwitcher — SSR smoke", () => {
  it("renders the current org's name in the trigger", () => {
    const html = render({
      organizations: [acme, beta],
      currentOrganizationId: "org_acme",
    });
    assert.match(html, /Acme Pizza/);
  });

  it("falls back to a 'no organizations' placeholder when none is active", () => {
    const html = render({
      organizations: [],
      copy: { noOrganizationsLabel: "Select workspace" },
    });
    assert.match(html, /Select workspace/);
  });

  it("renders an `<img>` for the current org when imageUrl is set", () => {
    const html = render({
      organizations: [acme],
      currentOrganizationId: "org_acme",
    });
    assert.match(html, /<img[^>]+src="https:\/\/example\.com\/acme\.png"/);
  });

  it("renders an initial-letter placeholder when current org has no imageUrl", () => {
    const html = render({
      organizations: [beta],
      currentOrganizationId: "org_beta",
    });
    // First letter of "Beta Bakery" uppercased.
    assert.match(html, />B</);
    // And NOT an img tag (no imageUrl).
    assert.equal(/<img[^>]+src=/.test(html), false);
  });

  it("composes `classNames.trigger` into the trigger element", () => {
    const html = render({
      organizations: [acme],
      currentOrganizationId: "org_acme",
      classNames: { trigger: "consumer-trigger-cls" },
    });
    assert.match(html, /consumer-trigger-cls/);
  });

  it("emits the dropdown a11y attributes on the trigger", () => {
    const html = render({
      organizations: [acme],
      currentOrganizationId: "org_acme",
    });
    assert.match(html, /aria-haspopup="menu"/);
    assert.match(html, /aria-expanded="false"/);
  });

  it("accepts the new search and in-place create props without changing closed SSR markup", () => {
    const html = render({
      organizations: [acme, beta],
      currentOrganizationId: "org_acme",
      enableSearch: true,
      onInPlaceCreateOrganization: async () => {},
    });
    assert.match(html, /Acme Pizza/);
    assert.match(html, /aria-expanded="false"/);
    // Search and in-place create UI only render inside the open dropdown.
    assert.equal(/Search workspaces/.test(html), false);
  });
});
