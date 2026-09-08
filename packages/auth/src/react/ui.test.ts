/**
 * SSR smoke coverage for the auth UI primitives in `ui.tsx`.
 *
 * These are the atomic building blocks every consumer uses to assemble
 * an auth surface. Until now: no direct coverage of the slot/className
 * contracts beyond what auth-forms-classnames.test.ts exercises in
 * higher composites.
 *
 * Contract:
 *   1. AuthScreen renders title + description + children
 *   2. AuthScreen omits the description paragraph when not provided
 *   3. AuthCard composes className over its default styles
 *   4. AuthCardHeader renders title + description
 *   5. AuthAlert tones flip the color theme (error / success / info)
 *   6. AuthDivider with label embeds the label text
 *   7. AuthDivider without label renders just the rule
 *   8. AuthInput is rendered as an <input> with the consumer's id/name
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { AuthAlert, AuthCard, AuthCardHeader, AuthDivider, AuthInput, AuthScreen } from "./ui";

describe("AuthScreen", () => {
  it("renders title + description + children", () => {
    const html = renderToStaticMarkup(
      createElement(AuthScreen, {
        title: "Sign in",
        description: "Welcome back",
        children: createElement("p", { id: "kid" }, "child"),
      }),
    );
    assert.match(html, /Sign in/);
    assert.match(html, /Welcome back/);
    assert.match(html, /id="kid"/);
  });

  it("omits the description paragraph when not provided", () => {
    const html = renderToStaticMarkup(
      createElement(AuthScreen, {
        title: "Sign in",
        children: createElement("p", null, "child"),
      }),
    );
    assert.match(html, /Sign in/);
    // No description means no second <p> in the header block.
    const headerBlock = html.match(/<div [^>]*space-y-2[^>]*>([\s\S]*?)<\/div>/);
    const headerContent = headerBlock?.[1];
    assert.ok(headerContent !== undefined, "header block missing");
    assert.equal((headerContent.match(/<p/g) ?? []).length, 0);
  });
});

describe("AuthCard", () => {
  it("composes consumer className over its default classes", () => {
    const html = renderToStaticMarkup(
      createElement(AuthCard, {
        className: "consumer-card-cls",
        children: "body",
      }),
    );
    assert.match(html, /consumer-card-cls/);
    // Default card styling still present.
    assert.match(html, /rounded-2xl/);
  });
});

describe("AuthCardHeader", () => {
  it("renders title + description", () => {
    const html = renderToStaticMarkup(
      createElement(AuthCardHeader, {
        title: "Card title",
        description: "Card sub",
      }),
    );
    assert.match(html, /Card title/);
    assert.match(html, /Card sub/);
  });
});

describe("AuthAlert", () => {
  it("error tone uses the destructive color token", () => {
    const html = renderToStaticMarkup(
      createElement(AuthAlert, { tone: "error", children: "Boom" }),
    );
    assert.match(html, /destructive/);
    assert.match(html, /Boom/);
  });

  it("success tone uses the success color token", () => {
    const html = renderToStaticMarkup(
      createElement(AuthAlert, { tone: "success", children: "OK" }),
    );
    assert.match(html, /success/);
  });
});

describe("AuthDivider", () => {
  it("with label embeds the label text", () => {
    const html = renderToStaticMarkup(createElement(AuthDivider, { label: "OR" }));
    assert.match(html, /OR/);
  });

  it("without label renders just the rule structure", () => {
    const html = renderToStaticMarkup(createElement(AuthDivider, {}));
    // No text content beyond markup whitespace.
    assert.equal(/OR/.test(html), false);
  });
});

describe("AuthInput", () => {
  it("renders as an <input> with the consumer's id and name", () => {
    const html = renderToStaticMarkup(
      createElement(AuthInput, {
        id: "email-input",
        name: "email",
        type: "email",
      }),
    );
    assert.match(html, /<input[^>]+id="email-input"/);
    assert.match(html, /name="email"/);
    assert.match(html, /type="email"/);
  });
});
