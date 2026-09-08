import assert from "node:assert/strict";

import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  ConvexAuthSignInButton,
  ConvexAuthSignOutButton,
  ConvexAuthSignUpButton,
} from "./auth-triggers";

const noop = () => {};

describe("Auth trigger components", () => {
  it("ConvexAuthSignInButton renders with default copy and primary variant", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAuthSignInButton, { redirectToSignIn: noop }),
    );
    assert.match(html, /<button[^>]+type="button"/);
    assert.match(html, />Sign in</);
  });

  it("ConvexAuthSignUpButton renders with default copy and secondary variant", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAuthSignUpButton, { redirectToSignUp: noop }),
    );
    assert.match(html, /<button[^>]+type="button"/);
    assert.match(html, />Sign up</);
  });

  it("ConvexAuthSignOutButton renders with default copy and secondary variant", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAuthSignOutButton, { signOut: noop }),
    );
    assert.match(html, /<button[^>]+type="button"/);
    assert.match(html, />Sign out</);
  });

  it("ConvexAuthSignInButton passes redirectToSignIn through to the action button", () => {
    let called = false;
    const redirectToSignIn = () => {
      called = true;
    };
    const element = ConvexAuthSignInButton({ redirectToSignIn });
    assert.ok(isValidElement(element));
    assert.equal(element.props.onClick, redirectToSignIn);
    element.props.onClick();
    assert.ok(called);
  });

  it("ConvexAuthSignUpButton passes redirectToSignUp through to the action button", () => {
    let called = false;
    const redirectToSignUp = () => {
      called = true;
    };
    const element = ConvexAuthSignUpButton({ redirectToSignUp });
    assert.ok(isValidElement(element));
    assert.equal(element.props.onClick, redirectToSignUp);
    element.props.onClick();
    assert.ok(called);
  });

  it("ConvexAuthSignOutButton passes signOut through to the action button", () => {
    let called = false;
    const signOut = () => {
      called = true;
    };
    const element = ConvexAuthSignOutButton({ signOut });
    assert.ok(isValidElement(element));
    assert.equal(element.props.onClick, signOut);
    element.props.onClick();
    assert.ok(called);
  });

  it("allows overriding default children", () => {
    const html = renderToStaticMarkup(
      createElement(ConvexAuthSignInButton, { redirectToSignIn: noop }, "Log in"),
    );
    assert.match(html, />Log in</);
  });
});
