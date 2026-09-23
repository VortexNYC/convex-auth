// @vitest-environment happy-dom

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const actionMocks = new Map<string, ReturnType<typeof vi.fn>>();
const mockClient = {
  setAuth: vi.fn(),
  clearAuth: vi.fn(),
  action: vi.fn(),
};

vi.mock("convex/react", () => ({
  useConvex: () => mockClient,
  // Stable per-ref identity — the real useAction memoizes; a fresh vi.fn()
  // per render would retrigger the provider's effects forever.
  useAction: (ref: unknown) => {
    const key = ref as string;
    if (!actionMocks.has(key)) {
      actionMocks.set(key, vi.fn().mockName(key));
    }
    return actionMocks.get(key)!;
  },
  useQuery: () => undefined,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  ConvexAuthProvider,
  useAuthActions,
  useSession,
  type ConvexAuthProviderProps,
  type NativeAuthActions,
} from "./ConvexAuthProvider.js";

const ref = (name: string) => name as never;

const baseActions = {
  signUp: ref("signUp"),
  signIn: ref("signIn"),
  signOut: ref("signOut"),
  sendEmailVerification: ref("sendEmailVerification"),
  verifyEmail: ref("verifyEmail"),
  sendPasswordReset: ref("sendPasswordReset"),
  resetPassword: ref("resetPassword"),
  verifyPassword: ref("verifyPassword"),
  updateSession: ref("updateSession"),
  verifySession: ref("verifySession"),
  twoFactorVerifyTOTP: ref("twoFactorVerifyTOTP"),
  signInMagicLink: ref("signInMagicLink"),
  signInWithRedirect: ref("signInWithRedirect"),
} as NativeAuthActions;

const sessionResult = {
  token: "minted-token",
  sessionId: "minted-session",
  user: { id: "u1", email: "a@b.c" },
};

function proxyOk(body: unknown = sessionResult) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

let latestActions: ReturnType<typeof useAuthActions> | null = null;

function Probe() {
  latestActions = useAuthActions();
  return null;
}

function renderProvider(props: Partial<ConvexAuthProviderProps> = {}) {
  return render(
    React.createElement(
      ConvexAuthProvider,
      { actions: baseActions, ...props },
      React.createElement(Probe),
    ),
  );
}

function proxyCalls() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: url as string,
    body: JSON.parse((init as RequestInit).body as string) as {
      intent: string;
      args: Record<string, unknown>;
    },
    credentials: (init as RequestInit).credentials,
  }));
}

beforeEach(() => {
  actionMocks.clear();
  fetchMock.mockReset();
  mockClient.setAuth.mockClear();
  mockClient.action.mockClear();
  window.localStorage.clear();
  document.cookie = "__convexAuthLandingVerifier=; Max-Age=0; Path=/";
  latestActions = null;
});

afterEach(cleanup);

describe("ConvexAuthProvider cookie mode", () => {
  it("hydrates from server state without touching storage", async () => {
    renderProvider({
      storageMode: "cookies",
      initialToken: "server-token",
      initialSessionId: "server-session",
      initialUser: { id: "u1" } as never,
    });
    await waitFor(() => expect(latestActions?.token).toBe("server-token"));
    expect(latestActions?.sessionId).toBe("server-session");
    expect(latestActions?.isAuthenticated).toBe(true);
    // No browser persistence in cookie mode
    expect(window.localStorage.length).toBe(0);
    expect(latestActions?.refreshToken).toBeNull();
  });

  it("does not ingest tokens from the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/?token=url-token&refreshToken=url-refresh&sessionId=url-session",
    );
    renderProvider({ storageMode: "cookies" });
    await waitFor(() => expect(latestActions).not.toBeNull());
    expect(latestActions?.token).toBeNull();
    // The URL is left for the middleware to strip — the client never
    // touches it in cookie mode.
    expect(window.location.search).toContain("token=url-token");
    window.history.replaceState(null, "", "/");
  });

  it("routes signIn through the proxy and keeps the refresh token server-side", async () => {
    proxyOk(sessionResult);
    renderProvider({ storageMode: "cookies" });
    await waitFor(() => expect(latestActions).not.toBeNull());

    await act(() => latestActions!.signIn({ email: "a@b.c", password: "pw" } as never));

    const [call] = proxyCalls();
    expect(call.url).toBe("/api/auth");
    expect(call.body).toEqual({
      intent: "signIn",
      args: { email: "a@b.c", password: "pw" },
    });
    expect(call.credentials).toBe("same-origin");
    expect(latestActions?.token).toBe("minted-token");
    expect(latestActions?.sessionId).toBe("minted-session");
    // The proxy strips refreshToken from the JSON body; state never holds it.
    expect(latestActions?.refreshToken).toBeNull();
    expect(window.localStorage.length).toBe(0);
    // The direct action was never invoked
    expect(actionMocks.get("signIn")).not.toHaveBeenCalled();
  });

  it("routes updateSession through the proxy without a refresh token arg", async () => {
    proxyOk(sessionResult);
    renderProvider({
      storageMode: "cookies",
      initialToken: "t",
      initialSessionId: "s",
    });
    await waitFor(() => expect(latestActions?.token).toBe("t"));

    await act(() => latestActions!.updateSession());

    const [call] = proxyCalls();
    expect(call.body.intent).toBe("updateSession");
    expect(call.body.args).toEqual({});
    expect(latestActions?.token).toBe("minted-token");
  });

  it("routes 2FA verification through the proxy without a challenge token", async () => {
    proxyOk(sessionResult);
    renderProvider({ storageMode: "cookies" });
    await waitFor(() => expect(latestActions).not.toBeNull());

    await act(() => latestActions!.twoFactor.verifyTotp({ code: "123456" }));

    const [call] = proxyCalls();
    expect(call.body.intent).toBe("twoFactorVerifyTOTP");
    expect(call.body.args).toEqual({ code: "123456" });
    expect(latestActions?.token).toBe("minted-token");
  });

  it("always proxies signOut and clears local state even when the proxy fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    renderProvider({
      storageMode: "cookies",
      initialToken: "t",
      initialSessionId: "s",
      initialUser: { id: "u1" } as never,
    });
    await waitFor(() => expect(latestActions?.isAuthenticated).toBe(true));

    await act(async () => {
      await expect(latestActions!.signOut()).rejects.toThrow("network down");
    });

    const [call] = proxyCalls();
    expect(call.body.intent).toBe("signOut");
    await waitFor(() => expect(latestActions?.token).toBeNull());
    expect(latestActions?.isAuthenticated).toBe(false);
  });

  it("attaches the landing-verifier cookie value to magic-link initiation", async () => {
    renderProvider({ storageMode: "cookies" });
    await waitFor(() => expect(latestActions).not.toBeNull());

    await act(() => latestActions!.signInWithMagicLink({ email: "a@b.c" } as never));

    const call = actionMocks.get("signInMagicLink")!.mock.calls[0][0] as Record<string, unknown>;
    expect(call.email).toBe("a@b.c");
    const verifier = call.landingVerifier as string;
    expect(verifier).toBeTruthy();
    // The verifier it sent is the cookie value the boundary will compare at
    // landing — happy-dom's hostname is localhost, so no __Host- prefix.
    expect(document.cookie).toContain(`__convexAuthLandingVerifier=${verifier}`);
  });

  it("reuses the existing verifier cookie instead of minting a new one", async () => {
    document.cookie = "__convexAuthLandingVerifier=lv-existing; Path=/; SameSite=Lax";
    renderProvider({ storageMode: "cookies" });
    await waitFor(() => expect(latestActions).not.toBeNull());

    mockClient.action.mockResolvedValue({ url: "https://provider.example/authorize" });
    await act(() => latestActions!.signInWithRedirect({ provider: "github" } as never));

    expect(mockClient.action).toHaveBeenLastCalledWith(
      "signInWithRedirect",
      expect.objectContaining({ provider: "github", landingVerifier: "lv-existing" }),
    );
  });

  it("omits the verifier in token mode (native/localStorage flows)", async () => {
    renderProvider({ storageMode: "localStorage" });
    await waitFor(() => expect(latestActions).not.toBeNull());

    mockClient.action.mockResolvedValue({ url: "https://provider.example/authorize" });
    await act(() => latestActions!.signInWithRedirect({ provider: "github" } as never));

    const args = mockClient.action.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(args).not.toHaveProperty("landingVerifier");
  });

  it("fires onAuthChange on transitions, not on mount", async () => {
    const onAuthChange = vi.fn();
    proxyOk(sessionResult);
    renderProvider({ storageMode: "cookies", onAuthChange });
    await waitFor(() => expect(latestActions).not.toBeNull());
    expect(onAuthChange).not.toHaveBeenCalled();

    await act(() => latestActions!.signIn({ email: "a@b.c", password: "pw" } as never));
    await waitFor(() => expect(onAuthChange).toHaveBeenCalledWith(true));
    expect(onAuthChange).toHaveBeenCalledTimes(1);
  });

  // `lastAppliedServerStateFetch` is module-scoped — the tests below use
  // strictly increasing fixed timestamps so the watermark ordering is
  // deterministic regardless of wall-clock timing.
  it("re-seeds from a newer serverState after a server-side rotation", async () => {
    const base = 1_700_000_000_000;
    const { rerender } = renderProvider({
      storageMode: "cookies",
      serverState: {
        token: "token-v1",
        sessionId: "s1",
        user: { id: "u1" } as never,
        _timeFetched: base,
      },
    });
    await waitFor(() => expect(latestActions?.token).toBe("token-v1"));

    // Middleware rotated the pair; the next RSC payload carries the new token.
    rerender(
      React.createElement(
        ConvexAuthProvider,
        {
          actions: baseActions,
          storageMode: "cookies" as const,
          serverState: {
            token: "token-v2",
            sessionId: "s2",
            user: { id: "u1" } as never,
            _timeFetched: base + 1000,
          },
        },
        React.createElement(Probe),
      ),
    );
    await waitFor(() => expect(latestActions?.token).toBe("token-v2"));
    expect(latestActions?.sessionId).toBe("s2");

    // A stale payload (older watermark — e.g. cached router entry) is ignored.
    rerender(
      React.createElement(
        ConvexAuthProvider,
        {
          actions: baseActions,
          storageMode: "cookies" as const,
          serverState: {
            token: "token-v1",
            sessionId: "s1",
            user: { id: "u1" } as never,
            _timeFetched: base,
          },
        },
        React.createElement(Probe),
      ),
    );
    await act(async () => {});
    expect(latestActions?.token).toBe("token-v2");
    expect(latestActions?.sessionId).toBe("s2");
  });

  it("useSession is authenticated on first paint with a server-seeded session", async () => {
    let session: ReturnType<typeof useSession> | null = null;
    function SessionProbe() {
      session = useSession();
      return null;
    }
    render(
      React.createElement(
        ConvexAuthProvider,
        {
          actions: baseActions,
          storageMode: "cookies" as const,
          serverState: {
            token: "verified-token",
            sessionId: "s1",
            user: { id: "u1" } as never,
            _timeFetched: 1_700_000_001_000,
          },
        },
        React.createElement(SessionProbe),
      ),
    );
    // First paint: no waiting — the server-verified session is already
    // authenticated even before the live query and setAuth handshake resolve.
    expect(session?.isAuthenticated).toBe(true);
    expect(session?.user?.id).toBe("u1");
  });

  it("signs the client out when a newer serverState carries no token (revoked)", async () => {
    const base = 1_700_000_002_000;
    const { rerender } = renderProvider({
      storageMode: "cookies",
      serverState: {
        token: "token-v1",
        sessionId: "s1",
        user: { id: "u1" } as never,
        _timeFetched: base,
      },
    });
    await waitFor(() => expect(latestActions?.isAuthenticated).toBe(true));

    rerender(
      React.createElement(
        ConvexAuthProvider,
        {
          actions: baseActions,
          storageMode: "cookies" as const,
          serverState: {
            token: null,
            sessionId: null,
            user: null,
            _timeFetched: base + 1000,
          },
        },
        React.createElement(Probe),
      ),
    );
    await waitFor(() => expect(latestActions?.token).toBeNull());
    expect(latestActions?.isAuthenticated).toBe(false);
  });
});

describe("ConvexAuthProvider localStorage mode (regression)", () => {
  it("still calls the action directly and persists the refresh token", async () => {
    const signInMock = vi.fn().mockResolvedValue({
      ...sessionResult,
      refreshToken: "client-refresh",
    });
    actionMocks.set("signIn", signInMock);
    renderProvider();
    await waitFor(() => expect(latestActions).not.toBeNull());

    await act(() => latestActions!.signIn({ email: "a@b.c", password: "pw" } as never));

    expect(signInMock).toHaveBeenCalledWith({
      email: "a@b.c",
      password: "pw",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(latestActions?.token).toBe("minted-token");
    expect(latestActions?.refreshToken).toBe("client-refresh");
    expect(window.localStorage.getItem("convex-auth-token")).toBe("minted-token");
    expect(window.localStorage.getItem("convex-auth-refresh-token")).toBe("client-refresh");
  });

  it("still ingests tokens from the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/?token=url-token&refreshToken=url-refresh&sessionId=url-session",
    );
    renderProvider();
    await waitFor(() => expect(latestActions?.token).toBe("url-token"));
    expect(latestActions?.refreshToken).toBe("url-refresh");
    expect(window.location.search).not.toContain("token=");
    window.history.replaceState(null, "", "/");
  });
});
