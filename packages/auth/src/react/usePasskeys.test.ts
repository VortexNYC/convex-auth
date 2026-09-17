// @vitest-environment happy-dom

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const startAuthenticationMock = vi.fn();
const startRegistrationMock = vi.fn();
const browserSupportsWebAuthnMock = vi.fn(() => true);

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => browserSupportsWebAuthnMock(),
  startAuthentication: (...args: unknown[]) => startAuthenticationMock(...args),
  startRegistration: (...args: unknown[]) => startRegistrationMock(...args),
}));

const generateRegistrationOptions = vi.fn();
const verifyRegistration = vi.fn();
const generateAuthenticationOptions = vi.fn();
const verifyAuthentication = vi.fn();
const revokePasskey = vi.fn();
const renamePasskey = vi.fn();
const listPasskeys = vi.fn(() => []);

vi.mock("convex/react", () => ({
  useAction: (ref: unknown) => {
    if (ref === "generateReg") return generateRegistrationOptions;
    if (ref === "verifyReg") return verifyRegistration;
    if (ref === "generateAuth") return generateAuthenticationOptions;
    if (ref === "verifyAuth") return verifyAuthentication;
    return vi.fn();
  },
  useMutation: (ref: unknown) => {
    if (ref === "revoke") return revokePasskey;
    if (ref === "rename") return renamePasskey;
    return vi.fn();
  },
  useQuery: () => listPasskeys(),
}));

import { ConvexAuthContext } from "./ConvexAuthProvider.js";
import { usePasskeys } from "./usePasskeys";

const authenticationOptions = {
  challenge: "auth-challenge",
  rpId: "example.com",
  allowCredentials: [],
};

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    getPasskeyRegistrationOptions: "generateReg",
    verifyPasskeyRegistration: "verifyReg",
    getPasskeyAuthenticationOptions: "generateAuth",
    verifyPasskeyAuthentication: "verifyAuth",
    listPasskeys: "list",
    revokePasskey: "revoke",
    renamePasskey: "rename",
    setToken: vi.fn(),
    setRefreshToken: vi.fn(),
    setSessionId: vi.fn(),
    setTwoFactorChallengeToken: vi.fn(),
    ...overrides,
  } as never;
}

function wrapper(ctx: unknown) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      ConvexAuthContext.Provider as React.Provider<unknown>,
      { value: ctx },
      children,
    );
  };
}

const args = { userId: "user_1", identifier: "user@example.com" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  browserSupportsWebAuthnMock.mockReturnValue(true);
  generateAuthenticationOptions.mockResolvedValue(authenticationOptions);
});

describe("web usePasskeys", () => {
  it("reports WebAuthn support without fetching ceremony options on mount", async () => {
    const { result } = renderHook(() => usePasskeys(args), { wrapper: wrapper(makeCtx()) });

    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(generateRegistrationOptions).not.toHaveBeenCalled();
    expect(generateAuthenticationOptions).not.toHaveBeenCalled();
  });

  it("signs in through the browser ceremony and stores the session tokens", async () => {
    const ceremonyResponse = { id: "cred_1", rawId: "cred_1", response: {} };
    startAuthenticationMock.mockResolvedValue(ceremonyResponse);
    verifyAuthentication.mockResolvedValue({
      token: "tok",
      refreshToken: "refresh",
      sessionId: "sess",
    });
    const ctx = makeCtx();
    const { result } = renderHook(() => usePasskeys(args), { wrapper: wrapper(ctx) });
    await waitFor(() => expect(result.current.supported).toBe(true));

    await act(() => result.current.signIn());

    expect(startAuthenticationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        optionsJSON: expect.objectContaining({ challenge: "auth-challenge" }),
      }),
    );
    expect(verifyAuthentication).toHaveBeenCalledWith({
      challenge: "auth-challenge",
      response: ceremonyResponse,
    });
    expect((ctx as { setToken: ReturnType<typeof vi.fn> }).setToken).toHaveBeenCalledWith("tok");
    expect(
      (ctx as { setRefreshToken: ReturnType<typeof vi.fn> }).setRefreshToken,
    ).toHaveBeenCalledWith("refresh");
    expect((ctx as { setSessionId: ReturnType<typeof vi.fn> }).setSessionId).toHaveBeenCalledWith(
      "sess",
    );
  });

  it("stores the pending challenge token when sign-in resolves to a 2FA redirect", async () => {
    startAuthenticationMock.mockResolvedValue({ id: "cred_1", rawId: "cred_1", response: {} });
    verifyAuthentication.mockResolvedValue({
      token: undefined,
      refreshToken: undefined,
      sessionId: undefined,
      twoFactorRedirect: true,
      twoFactorChallengeToken: "pending-token",
      twoFactorMethods: ["totp"],
    });
    const ctx = makeCtx();
    const { result } = renderHook(() => usePasskeys(args), { wrapper: wrapper(ctx) });
    await waitFor(() => expect(result.current.supported).toBe(true));

    await act(() => result.current.signIn());

    expect(
      (ctx as { setTwoFactorChallengeToken: ReturnType<typeof vi.fn> }).setTwoFactorChallengeToken,
    ).toHaveBeenCalledWith("pending-token");
    expect((ctx as { setToken: ReturnType<typeof vi.fn> }).setToken).not.toHaveBeenCalled();
  });
});
