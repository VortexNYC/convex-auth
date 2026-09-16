// @vitest-environment happy-dom

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const createMock = vi.fn();
const getMock = vi.fn();
const isSupportedMock = vi.fn(() => true);

vi.mock("react-native-passkeys", () => ({
  create: (...args: unknown[]) => createMock(...args),
  get: (...args: unknown[]) => getMock(...args),
  isSupported: () => isSupportedMock(),
  isAutoFillAvalilable: () => false,
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

import { ConvexAuthContext } from "../react/ConvexAuthProvider.js";
import { usePasskeys } from "./usePasskeys";

const registrationOptions = {
  challenge: "reg-challenge",
  rp: { id: "example.com", name: "Example" },
  user: { id: "dXNlcjE", name: "user@example.com", displayName: "user@example.com" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
};

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

const args = {
  userId: "user_1",
  identifier: "user@example.com",
  rpName: "Example",
  rpID: "example.com",
  origin: "https://example.com",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  generateRegistrationOptions.mockResolvedValue(registrationOptions);
  generateAuthenticationOptions.mockResolvedValue(authenticationOptions);
});

describe("react-native usePasskeys", () => {
  it("reports support and fetches registration + authentication options", async () => {
    const { result } = renderHook(() => usePasskeys(args), {
      wrapper: wrapper(makeCtx()),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supported).toBe(true);
    expect(generateRegistrationOptions).toHaveBeenCalledWith({
      userId: "user_1",
      identifier: "user@example.com",
      displayName: "user@example.com",
      rpName: "Example",
      rpID: "example.com",
    });
    expect(generateAuthenticationOptions).toHaveBeenCalledWith({
      userId: "user_1",
      rpID: "example.com",
    });
  });

  it("forwards the native registration ceremony response to verification", async () => {
    const ceremonyResponse = { id: "cred_1", rawId: "cred_1", response: {} };
    createMock.mockResolvedValue(ceremonyResponse);
    const { result } = renderHook(() => usePasskeys(args), {
      wrapper: wrapper(makeCtx()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.register("My iPhone"));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ challenge: "reg-challenge" }),
    );
    expect(verifyRegistration).toHaveBeenCalledWith({
      userId: "user_1",
      identifier: "user@example.com",
      challenge: "reg-challenge",
      response: ceremonyResponse,
      rpID: "example.com",
      origin: "https://example.com",
      name: "My iPhone",
    });
  });

  it("signs in through the native ceremony and stores the session tokens", async () => {
    const ceremonyResponse = { id: "cred_1", rawId: "cred_1", response: {} };
    getMock.mockResolvedValue(ceremonyResponse);
    verifyAuthentication.mockResolvedValue({
      token: "tok",
      refreshToken: "refresh",
      sessionId: "sess",
    });
    const ctx = makeCtx();
    const { result } = renderHook(() => usePasskeys(args), { wrapper: wrapper(ctx) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.signIn());

    expect(getMock).toHaveBeenCalledWith(expect.objectContaining({ challenge: "auth-challenge" }));
    expect(verifyAuthentication).toHaveBeenCalledWith({
      challenge: "auth-challenge",
      response: ceremonyResponse,
      rpID: "example.com",
      origin: "https://example.com",
    });
    expect((ctx as { setToken: ReturnType<typeof vi.fn> }).setToken).toHaveBeenCalledWith("tok");
    expect(
      (ctx as { setRefreshToken: ReturnType<typeof vi.fn> }).setRefreshToken,
    ).toHaveBeenCalledWith("refresh");
    expect((ctx as { setSessionId: ReturnType<typeof vi.fn> }).setSessionId).toHaveBeenCalledWith(
      "sess",
    );
  });

  it("surfaces a cancelled registration ceremony as an error", async () => {
    createMock.mockResolvedValue(null);
    const { result } = renderHook(() => usePasskeys(args), {
      wrapper: wrapper(makeCtx()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.register("x")).rejects.toThrow("cancelled");
    expect(verifyRegistration).not.toHaveBeenCalled();
  });

  it("surfaces a cancelled authentication ceremony as an error", async () => {
    getMock.mockResolvedValue(null);
    const { result } = renderHook(() => usePasskeys(args), {
      wrapper: wrapper(makeCtx()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.signIn()).rejects.toThrow("cancelled");
    expect(verifyAuthentication).not.toHaveBeenCalled();
  });

  it("reports unsupported devices", async () => {
    isSupportedMock.mockReturnValueOnce(false);
    const { result } = renderHook(() => usePasskeys(args), {
      wrapper: wrapper(makeCtx()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supported).toBe(false);
  });

  it("throws when passkeys are not configured in convexAuth", () => {
    const ctx = makeCtx();
    delete (ctx as Record<string, unknown>).getPasskeyRegistrationOptions;
    expect(() => renderHook(() => usePasskeys(args), { wrapper: wrapper(ctx) })).toThrow(
      "Passkeys are not configured",
    );
  });
});
