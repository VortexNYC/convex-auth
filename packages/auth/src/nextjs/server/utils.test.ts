import { describe, expect, it } from "vitest";
import { getConvexNextjsOptions } from "./utils.js";

describe("getConvexNextjsOptions", () => {
  it("returns the url when convexUrl is provided", () => {
    expect(getConvexNextjsOptions({ convexUrl: "https://example.convex.cloud" })).toEqual({
      url: "https://example.convex.cloud",
    });
  });

  it("returns an empty options object when convexUrl is absent", () => {
    expect(getConvexNextjsOptions({})).toEqual({});
  });

  it("does not emit url: undefined when the key is present but unset", () => {
    /* Callers spread `{ convexUrl: options.convexUrl }` — a present-but-
     * undefined key must not produce `{ url: undefined }`: convex/nextjs
     * logs "deploymentUrl is undefined" on every call and will treat an
     * explicit undefined as an error in a future release. */
    expect(getConvexNextjsOptions({ convexUrl: undefined })).toEqual({});
  });
});
