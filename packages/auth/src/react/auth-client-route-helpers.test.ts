import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  getConvexAuthenticatedRouteRedirectPath,
  shouldCaptureConvexAuthenticatedRouteSuccess,
  shouldShowConvexAuthenticatedRouteLoading,
  shouldShowConvexAuthenticatedRouteOrganizationRequired,
} from "./auth-client-route-helpers";

describe("auth-client-route-helpers", () => {
  describe("shouldShowConvexAuthenticatedRouteOrganizationRequired", () => {
    it("is true when no organization and not on a recovery route", () => {
      assert.equal(
        shouldShowConvexAuthenticatedRouteOrganizationRequired({
          hasOrganization: false,
          isChooseOrganizationRoute: false,
          isPostSignUpRoute: false,
        }),
        true,
      );
    });

    it("is false when on the post-sign-up route", () => {
      assert.equal(
        shouldShowConvexAuthenticatedRouteOrganizationRequired({
          hasOrganization: false,
          isChooseOrganizationRoute: false,
          isPostSignUpRoute: true,
        }),
        false,
      );
    });

    it("is false when the user already has an organization", () => {
      assert.equal(
        shouldShowConvexAuthenticatedRouteOrganizationRequired({
          hasOrganization: true,
          isChooseOrganizationRoute: false,
          isPostSignUpRoute: false,
        }),
        false,
      );
    });
  });

  describe("shouldShowConvexAuthenticatedRouteLoading", () => {
    it("is true when auth is not loaded", () => {
      assert.equal(
        shouldShowConvexAuthenticatedRouteLoading({
          isAuthLoaded: false,
          isOrganizationLoading: false,
          isPostSignUpRoute: false,
        }),
        true,
      );
    });

    it("is true when organization is loading outside post-sign-up", () => {
      assert.equal(
        shouldShowConvexAuthenticatedRouteLoading({
          isAuthLoaded: true,
          isOrganizationLoading: true,
          isPostSignUpRoute: false,
        }),
        true,
      );
    });

    it("is false when loaded and not on a loading organization", () => {
      assert.equal(
        shouldShowConvexAuthenticatedRouteLoading({
          isAuthLoaded: true,
          isOrganizationLoading: false,
          isPostSignUpRoute: false,
        }),
        false,
      );
    });
  });

  describe("shouldCaptureConvexAuthenticatedRouteSuccess", () => {
    it("is true when auth is loaded and signed in and org is not loading", () => {
      assert.equal(
        shouldCaptureConvexAuthenticatedRouteSuccess({
          isAuthLoaded: true,
          isSignedIn: true,
          isOrganizationLoading: false,
        }),
        true,
      );
    });

    it("is false when not signed in", () => {
      assert.equal(
        shouldCaptureConvexAuthenticatedRouteSuccess({
          isAuthLoaded: true,
          isSignedIn: false,
          isOrganizationLoading: false,
        }),
        false,
      );
    });
  });

  describe("getConvexAuthenticatedRouteRedirectPath", () => {
    it("combines pathname, search, and hash", () => {
      assert.equal(
        getConvexAuthenticatedRouteRedirectPath({
          pathname: "/dashboard",
          search: "?tab=1",
          hash: "#section",
        }),
        "/dashboard?tab=1#section",
      );
    });

    it("uses only pathname when other parts are missing", () => {
      assert.equal(
        getConvexAuthenticatedRouteRedirectPath({
          pathname: "/",
        }),
        "/",
      );
    });
  });
});
