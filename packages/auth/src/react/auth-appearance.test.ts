import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { ConvexAuthAppearanceProvider, useConvexAuthAppearance } from "./auth-appearance";

function TestConsumer() {
  const { theme, resolvedTheme } = useConvexAuthAppearance();
  return createElement(
    "span",
    { "data-test-theme": theme, "data-test-resolved": resolvedTheme },
    `${theme}-${resolvedTheme}`,
  );
}

describe("ConvexAuthAppearanceProvider", () => {
  it("renders with default light theme", () => {
    const html = renderToStaticMarkup(
      createElement(
        ConvexAuthAppearanceProvider,
        { defaultTheme: "light" },
        createElement(TestConsumer),
      ),
    );
    assert.match(html, />light-light</);
  });

  it("renders with default dark theme", () => {
    const html = renderToStaticMarkup(
      createElement(
        ConvexAuthAppearanceProvider,
        { defaultTheme: "dark" },
        createElement(TestConsumer),
      ),
    );
    assert.match(html, />dark-dark</);
  });

  it("resolves 'system' to light during SSR", () => {
    const html = renderToStaticMarkup(
      createElement(
        ConvexAuthAppearanceProvider,
        { defaultTheme: "system" },
        createElement(TestConsumer),
      ),
    );
    assert.match(html, />system-light</);
  });

  it("throws when the hook is used outside a provider", () => {
    assert.throws(() => {
      renderToStaticMarkup(createElement(TestConsumer));
    }, /useConvexAuthAppearance must be used within a ConvexAuthAppearanceProvider/);
  });
});
