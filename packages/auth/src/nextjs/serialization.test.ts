import { describe, expect, it } from "vitest";
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import type { NativeAuthActions } from "../react/ConvexAuthProvider.js";
import { normalizeAuthActions } from "./client.js";
import {
  serializeAuthActions,
  type SerializedAuthActions,
} from "./serialization.js";

/**
 * Mirrors the lazy `api.auth` Proxy: any property access fabricates a
 * FunctionReference named after the key, and `ownKeys` reports nothing — which
 * is why the proxy serializes to `{}` across the RSC boundary.
 */
function fakeApiAuth(): NativeAuthActions {
  return new Proxy(
    {},
    {
      get: (_target, key) =>
        typeof key === "string"
          ? makeFunctionReference(`auth:${key}`)
          : undefined,
      ownKeys: () => [],
    },
  ) as NativeAuthActions;
}

/** Stand-in for React Flight serialization: structured-cloneable JSON only. */
function acrossRscBoundary<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("serializeAuthActions", () => {
  it("extracts function names from a lazy api proxy into a plain manifest", () => {
    const serialized = serializeAuthActions(fakeApiAuth());
    expect(serialized.signIn).toBe("auth:signIn");
    expect(serialized.updateSession).toBe("auth:updateSession");
    expect(serialized.verifySession).toBe("auth:verifySession");
    expect(serialized.twoFactorVerifyTOTP).toBe("auth:twoFactorVerifyTOTP");
    // The manifest itself must be a plain object — no symbols, no proxies.
    expect(Object.getOwnPropertySymbols(serialized)).toHaveLength(0);
  });

  it("produces JSON-stable output (Flight-compatible)", () => {
    const serialized = serializeAuthActions(fakeApiAuth());
    expect(acrossRscBoundary(serialized)).toEqual(serialized);
  });

  it("regression: the raw api proxy loses all references across the boundary", () => {
    // Documents the bug this module fixes — a bare `api.auth` serializes to {}
    // because the Proxy exposes no enumerable own properties.
    expect(acrossRscBoundary(fakeApiAuth() as object)).toEqual({});
  });

  it("omits keys whose values are not FunctionReferences", () => {
    const actions = {
      signIn: makeFunctionReference("auth:signIn"),
      signUp: makeFunctionReference("auth:signUp"),
      signOut: makeFunctionReference("auth:signOut"),
      // A hand-assembled actions object may lack optional refs entirely.
    } as NativeAuthActions;
    const serialized = serializeAuthActions(actions);
    expect(serialized.signIn).toBe("auth:signIn");
    expect(serialized.listSessions).toBeUndefined();
  });
});

describe("normalizeAuthActions", () => {
  it("round-trips: server serialize → boundary → client normalize", () => {
    const manifest = acrossRscBoundary(serializeAuthActions(fakeApiAuth()));
    const actions = normalizeAuthActions(manifest);
    for (const [key, name] of Object.entries(manifest)) {
      const ref = actions[key as keyof NativeAuthActions] as FunctionReference;
      expect(getFunctionName(ref)).toBe(name);
    }
    expect(getFunctionName(actions.signIn)).toBe("auth:signIn");
  });

  it("rebuilt refs satisfy convex's own FunctionReference check", () => {
    const actions = normalizeAuthActions(
      acrossRscBoundary(serializeAuthActions(fakeApiAuth())),
    );
    // `useAction`/`fetchAction` resolve names via the same global symbol.
    const ref = actions.verifySession as unknown as Record<symbol, string>;
    expect(ref[Symbol.for("functionName")]).toBe("auth:verifySession");
  });

  it("passes live references through untouched", () => {
    const live = {
      signIn: makeFunctionReference("auth:signIn"),
    } as NativeAuthActions;
    expect(normalizeAuthActions(live)).toBe(live);
  });

  it("ignores non-string manifest values", () => {
    const manifest = {
      signUp: "auth:signUp",
      signIn: 42,
      updateSession: null,
    } as unknown as SerializedAuthActions;
    const actions = normalizeAuthActions(manifest);
    expect(getFunctionName(actions.signUp)).toBe("auth:signUp");
    expect(
      (actions as Record<string, unknown>).signIn,
    ).toBeUndefined();
    expect(
      (actions as Record<string, unknown>).updateSession,
    ).toBeUndefined();
  });
});
