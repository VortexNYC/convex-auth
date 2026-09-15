import * as React from "react";
import ReactDOMServer from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { useConvexAuthClient } from "./convex-auth-client";

const signIn = vi.fn().mockRejectedValue(new Error("signIn should not be called"));
const signInAnonymous = vi.fn().mockResolvedValue({
  token: "guest-token",
  refreshToken: "guest-refresh",
  sessionId: "guest-session",
  user: { id: "u_1", email: "u_1@test.anonymous", emailVerified: false, name: "Guest" },
});

vi.mock("./ConvexAuthProvider", () => ({
  useAuthActions: () => ({
    user: null,
    token: null,
    sessionId: null,
    isLoading: false,
    twoFactorChallengeToken: null,
    setTwoFactorChallengeToken: vi.fn(),
    signIn,
    signInAnonymous,
    signInWithRedirect: vi.fn(),
    setToken: vi.fn(),
    setSessionId: vi.fn(),
    setRefreshToken: vi.fn(),
  }),
}));

describe("useConvexAuthClient", () => {
  it("signIn.anonymous invokes the configured signInAnonymous action and never signIn", async () => {
    let promise: Promise<unknown> | undefined;

    function Test() {
      const client = useConvexAuthClient();
      promise = client.signIn.anonymous({});
      return null;
    }

    ReactDOMServer.renderToString(React.createElement(Test));

    expect(promise).toBeDefined();
    expect(signIn).not.toHaveBeenCalled();
    expect(signInAnonymous).toHaveBeenCalledOnce();
    await promise;
  });
});
