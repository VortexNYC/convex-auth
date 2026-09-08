import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  ConvexSignInButton,
  ConvexSignUpButton,
  type ConvexSignInButtonProps,
  type ConvexSignUpButtonProps,
} from "./auth-buttons";

const noop = () => {};

function renderSignIn(props: Partial<ConvexSignInButtonProps>): string {
  return renderToStaticMarkup(
    createElement(ConvexSignInButton, {
      mode: "redirect",
      signInUrl: "/sign-in",
      ...props,
    } as ConvexSignInButtonProps),
  );
}

function renderSignUp(props: Partial<ConvexSignUpButtonProps>): string {
  return renderToStaticMarkup(
    createElement(ConvexSignUpButton, {
      mode: "redirect",
      signUpUrl: "/sign-up",
      ...props,
    } as ConvexSignUpButtonProps),
  );
}

describe("ConvexSignInButton — SSR redirect mode", () => {
  it("renders a button with default label", () => {
    const html = renderSignIn({});
    assert.match(html, /<button/);
    assert.match(html, /Sign in/);
  });

  it("renders a custom children label", () => {
    const html = renderSignIn({ children: "Login" });
    assert.match(html, /Login/);
  });

  it("composes className into the rendered button", () => {
    const html = renderSignIn({ className: "my-sign-in" });
    assert.match(html, /my-sign-in/);
  });
});

describe("ConvexSignUpButton — SSR redirect mode", () => {
  it("renders a button with default label", () => {
    const html = renderSignUp({});
    assert.match(html, /<button/);
    assert.match(html, /Sign up/);
  });

  it("renders a custom children label", () => {
    const html = renderSignUp({ children: "Register" });
    assert.match(html, /Register/);
  });
});
