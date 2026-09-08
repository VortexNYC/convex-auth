/**
 * SSR smoke coverage for `ConvexCreateOrganization`.
 *
 * The Convex-owned "create your first workspace" form. Critical
 * for B2B onboarding when a user has no memberships and
 * invitedUsersGetPersonalOrg is disabled. Until now: no direct
 * coverage.
 *
 * Contract:
 *   1. renders the form (name input + slug input + submit button)
 *   2. default title + description come from the package
 *   3. `copy.title` overrides the default
 *   4. submit button is disabled when `onCreate` is undefined
 *     (consumers wire the mutation; the button reflects that wiring)
 *   5. `classNames.card` composes into the outer card
 *   6. helper text under the slug input is rendered
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  ConvexCreateOrganization,
  type ConvexCreateOrganizationProps,
} from "./create-organization";

const noop: ConvexCreateOrganizationProps["onCreate"] = async () => {};

function render(props: Partial<ConvexCreateOrganizationProps>): string {
  return renderToStaticMarkup(
    createElement(ConvexCreateOrganization, {
      ...props,
    }),
  );
}

describe("ConvexCreateOrganization — SSR smoke", () => {
  it("renders the form with name + slug inputs and submit button", () => {
    const html = render({ onCreate: noop });
    // Name + slug inputs.
    const inputCount = (html.match(/<input/g) ?? []).length;
    assert.ok(inputCount >= 2, `expected ≥2 inputs, got ${inputCount}`);
    // Submit button present.
    assert.match(html, /type="submit"/);
  });

  it("renders the default title and description", () => {
    const html = render({ onCreate: noop });
    // Defaults come from defaultCopy in create-organization.tsx.
    assert.match(html, /<h3/);
    assert.match(html, /<p/);
  });

  it("`copy.title` overrides the default title", () => {
    const html = render({
      onCreate: noop,
      copy: { title: "Spin up a workspace" },
    });
    assert.match(html, /Spin up a workspace/);
  });

  it("submit button is disabled when onCreate is undefined", () => {
    const html = render({});
    // Disabled boolean attribute on the submit button (consumers wire
    // the mutation handler; the button reflects that wiring).
    assert.match(html, /type="submit"[^>]+disabled/);
  });

  it("composes `classNames.card` into the outer card element", () => {
    const html = render({
      onCreate: noop,
      classNames: { card: "consumer-card-cls" },
    });
    assert.match(html, /consumer-card-cls/);
  });

  it("renders helper text under the slug input", () => {
    const html = render({
      onCreate: noop,
      copy: { slugHelper: "lowercase-only-please" },
    });
    assert.match(html, /lowercase-only-please/);
  });
});
