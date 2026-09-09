/**
 * SSR smoke coverage for `ConvexUserButton`.
 *
 * The component is the Convex-owned identity dropdown that every
 * convex-auth consumer wires in their app shell. SSR render gives us
 * fast, no-DOM structural assertions over the closed-state markup
 * (the dropdown panel only opens via client `useState`; it is not in
 * the static markup).
 *
 * Concrete contract we lock in:
 *   1. Default copy: when `user` is null, the trigger still renders.
 *   2. User initials derive from `name` (first + last initial) and fall
 *      back to email when `name` is absent.
 *   3. `classNames.trigger` is composed into the trigger button class
 *      attribute (theming/slot integration).
 *   4. `imageUrl` is rendered when provided; initials are NOT.
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { ConvexUserButton, type ConvexUserButtonProps } from "./user-button";

const noop = () => {};

function renderUserButton(props: Partial<ConvexUserButtonProps>): string {
  return renderToStaticMarkup(
    createElement(ConvexUserButton, {
      user: null,
      onSignOut: noop,
      onManageAccount: noop,
      ...props,
    } as ConvexUserButtonProps),
  );
}

describe("ConvexUserButton — SSR smoke", () => {
  it("renders nothing (no crash) when user is null — gate the consumer's loading state", () => {
    const html = renderUserButton({ user: null });
    // The component intentionally returns empty markup when there is no
    // user — consumers wrap it in their own loading/anonymous gate.
    assert.equal(html, "");
  });

  it("renders a trigger button when user is provided", () => {
    const html = renderUserButton({
      user: { id: "u1", email: "x@y.com" },
    });
    assert.match(html, /<button[^>]+type="button"/);
  });

  it("derives initials from `name` (first + last)", () => {
    const html = renderUserButton({
      user: { id: "u1", email: "shlomo@example.com", name: "Shlomo Kabareti" },
    });
    assert.match(html, /SK/);
  });

  it("falls back to email-derived initials when `name` is absent", () => {
    const html = renderUserButton({
      user: { id: "u1", email: "convex@example.com", name: null },
    });
    // First two chars of email, uppercased.
    assert.match(html, /CO/);
  });

  it("composes `classNames.trigger` into the trigger element", () => {
    const html = renderUserButton({
      user: { id: "u1", email: "x@y.com", name: "Alice Doe" },
      classNames: { trigger: "test-trigger-class" },
    });
    assert.match(html, /test-trigger-class/);
  });

  it("renders avatar `img` when `imageUrl` is provided", () => {
    const html = renderUserButton({
      user: {
        id: "u1",
        email: "x@y.com",
        name: "Alice Doe",
        imageUrl: "https://example.com/avatar.png",
      },
    });
    assert.match(html, /<img[^>]+src="https:\/\/example\.com\/avatar\.png"/);
  });
});
