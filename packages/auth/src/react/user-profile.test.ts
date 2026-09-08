/**
 * SSR smoke coverage for `ConvexUserProfile`.
 *
 * The Convex-owned account settings panel — display + edit user
 * profile metadata, surface email verification status, expose
 * change-password / 2FA / delete-account actions. Until now: zero
 * direct coverage.
 *
 * Contract:
 *   1. returns null (renders nothing) when user is null/undefined
 *   2. renders the user's email
 *   3. renders the user's name when set
 *   4. surfaces 'verified' copy when emailVerified is true
 *   5. surfaces 'not verified' copy when emailVerified is false
 *   6. exposes the change-password action when onChangePassword wired
 *   7. exposes the 2FA action when onManageTwoFactor wired
 *   8. exposes the delete-account action when onDeleteAccount wired
 *   9. `classNames.card` composes into the outer card element
 *  10. `copy.title` overrides the default
 */
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import {
  ConvexUserProfile,
  type ConvexUserProfileProps,
  type ConvexUserProfileUser,
} from "./user-profile";

const noop = async () => {};

function render(props: ConvexUserProfileProps): string {
  return renderToStaticMarkup(createElement(ConvexUserProfile, props));
}

const verifiedUser: ConvexUserProfileUser = {
  id: "u_1",
  email: "shlomo@convex.nyc",
  name: "Shlomo Kabareti",
  emailVerified: true,
};

const unverifiedUser: ConvexUserProfileUser = {
  id: "u_2",
  email: "fresh@convex.nyc",
  emailVerified: false,
};

describe("ConvexUserProfile — SSR smoke", () => {
  it("returns null when user is null", () => {
    assert.equal(render({ user: null }), "");
  });

  it("returns null when user is undefined", () => {
    assert.equal(render({ user: undefined }), "");
  });

  it("renders the user's email", () => {
    const html = render({ user: verifiedUser });
    assert.match(html, /shlomo@convex\.nyc/);
  });

  it("renders the user's name when set", () => {
    const html = render({ user: verifiedUser });
    assert.match(html, /Shlomo Kabareti/);
  });

  it("surfaces 'verified' copy when emailVerified is true", () => {
    const html = render({
      user: verifiedUser,
      copy: { verifiedLabel: "EMAIL_OK" },
    });
    assert.match(html, /EMAIL_OK/);
  });

  it("surfaces 'not verified' copy when emailVerified is false", () => {
    const html = render({
      user: unverifiedUser,
      copy: { notVerifiedLabel: "EMAIL_PENDING" },
    });
    assert.match(html, /EMAIL_PENDING/);
  });

  it("exposes the change-password action when wired", () => {
    const html = render({
      user: verifiedUser,
      onChangePassword: noop,
      copy: { changePasswordLabel: "CHANGE_PASS" },
    });
    assert.match(html, /CHANGE_PASS/);
  });

  it("exposes the 2FA action when wired", () => {
    const html = render({
      user: verifiedUser,
      onManageTwoFactor: noop,
      copy: { twoFactorLabel: "TFA_LABEL" },
    });
    assert.match(html, /TFA_LABEL/);
  });

  it("exposes the delete-account action when wired", () => {
    const html = render({
      user: verifiedUser,
      onDeleteAccount: noop,
      copy: { deleteAccountLabel: "DELETE_LABEL" },
    });
    assert.match(html, /DELETE_LABEL/);
  });

  it("composes `classNames.card` into the outer card element", () => {
    const html = render({
      user: verifiedUser,
      classNames: { card: "consumer-profile-card" },
    });
    assert.match(html, /consumer-profile-card/);
  });

  it("`copy.title` overrides the default title", () => {
    const html = render({
      user: verifiedUser,
      copy: { title: "Your account here" },
    });
    assert.match(html, /Your account here/);
  });
});
