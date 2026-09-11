import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { ConvexApiKeyCreated } from "./api-key-created";

const noop = () => {};

function render(props: { apiKey: string; onClose?: () => void }): string {
  return renderToStaticMarkup(createElement(ConvexApiKeyCreated, props));
}

describe("ConvexApiKeyCreated — SSR smoke", () => {
  it("renders the plaintext token and one-time warning", () => {
    const html = render({ apiKey: "vb_live_test_secret" });
    assert.match(html, /vb_live_test_secret/);
    assert.match(html, /only time the full token is shown/);
  });

  it("emits a Copy button", () => {
    const html = render({ apiKey: "vb_live_test_secret" });
    assert.match(html, />Copy</);
  });

  it("emits a Close button when onClose is provided", () => {
    const html = render({ apiKey: "vb_live_test_secret", onClose: noop });
    assert.match(html, />Close</);
  });

  it("does not emit a Close button when onClose is omitted", () => {
    const html = render({ apiKey: "vb_live_test_secret" });
    assert.equal(/>Close</.test(html), false);
  });

  it("composes custom classNames", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexApiKeyCreated, {
        apiKey: "vb_live_test_secret",
        classNames: {
          card: "consumer-card-cls",
          title: "consumer-title-cls",
          token: "consumer-token-cls",
        },
      }),
    );
    assert.match(html, /consumer-card-cls/);
    assert.match(html, /consumer-title-cls/);
    assert.match(html, /consumer-token-cls/);
  });
});
