import { describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";
import { nativePhone, type NativePhoneConfig } from "./phone.js";

function exec(registered: unknown) {
  if ((typeof registered !== "object" && typeof registered !== "function") || registered === null) {
    throw new TypeError("expected an executable spec");
  }
  const handler = Reflect.get(registered, "_handler");
  if (typeof handler !== "function") {
    throw new TypeError("expected an executable handler");
  }
  return {
    handler: async (ctx: unknown, args: Record<string, unknown>): Promise<unknown> =>
      await Reflect.apply(handler, registered, [ctx, args]),
  };
}

function dispatch(ref: unknown, args: Record<string, unknown>) {
  if (typeof ref === "function") {
    return (ref as (args: Record<string, unknown>) => unknown)(args);
  }
  if (typeof ref === "object" && ref !== null) {
    const handler = Reflect.get(ref, "_handler");
    if (typeof handler === "function") {
      return Reflect.apply(handler, ref, [{}, args]);
    }
  }
  return undefined;
}

function createContext(overrides: { userId?: string } = {}) {
  return {
    runQuery: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runMutation: vi.fn((ref: unknown, args: Record<string, unknown>) => dispatch(ref, args)),
    runAction: vi.fn(),
    auth: {
      getUserIdentity: vi
        .fn()
        .mockResolvedValue(
          overrides.userId
            ? { subject: overrides.userId, tokenIdentifier: overrides.userId }
            : null,
        ),
    },
  };
}

type Mockify<T> = {
  [K in keyof T]: T[K] extends FunctionReference<
    infer _Type,
    infer _Visibility,
    infer _Args,
    infer _Return,
    infer _ComponentPath
  >
    ? ReturnType<typeof vi.fn>
    : T[K] extends Record<string, unknown>
      ? Mockify<T[K]>
      : T[K];
};

function createMockComponent(): Mockify<NativeEmailAndPasswordComponentHandle> {
  return {
    identity: {
      provisionFromIdentity: vi.fn(),
      getUserAndAccount: vi.fn(),
      getUserAndAccountByUsername: vi.fn(),
      verifyEmail: vi.fn(),
      verifyPhone: vi.fn(),
      resetPassword: vi.fn(),
      changeEmail: vi.fn(),
    },
    native: {
      accounts: {
        createAccount: vi.fn(),
        updateCredentialHash: vi.fn(),
        getAccountBySubject: vi.fn(),
      },
      sessions: {
        createSession: vi.fn(),
        createSessionAndRefreshToken: vi.fn(),
        revokeSession: vi.fn(),
        listSessionsByUser: vi.fn(),
        getSessionByToken: vi.fn(),
        getSessionBySessionId: vi.fn(),
        revokeSessionsForUser: vi.fn(),
        rotateSession: vi.fn(),
      },
      refreshTokens: {
        createRefreshToken: vi.fn(),
        getRefreshTokenByTokenHash: vi.fn(),
        consumeRefreshToken: vi.fn(),
        revokeRefreshTokensForSession: vi.fn(),
        revokeRefreshTokensForUser: vi.fn(),
      },
      identities: {
        getNativeIdentityByUser: vi.fn(),
        markEmailVerified: vi.fn(),
      },
      users: {
        getUserByEmail: vi.fn(),
        getUserByPhoneNumber: vi.fn(),
        getUserById: vi.fn(),
        markEmailVerified: vi.fn(),
        setTwoFactor: vi.fn(),
        consumeBackupCode: vi.fn(),
      },
      codes: {
        createVerificationCode: vi.fn(),
        getVerificationCodeByTokenHash: vi.fn(),
        consumeVerificationCode: vi.fn(),
        revokeVerificationCodesForUser: vi.fn(),
      },
      verifiers: {
        createVerifier: vi.fn(),
        getVerifierByVerifierId: vi.fn(),
        consumeVerifier: vi.fn(),
      },
      rateLimits: {
        recordAttempt: vi.fn().mockResolvedValue({ allowed: true }),
      },
    },
  } as unknown as Mockify<NativeEmailAndPasswordComponentHandle>;
}

function createConfig(overrides: Partial<NativePhoneConfig> = {}): NativePhoneConfig {
  return {
    sendPhoneOtp: vi.fn().mockResolvedValue("sms_1"),
    ...overrides,
  };
}

const PHONE = "+15551234567";

describe("nativePhone", () => {
  it("sendPhoneOtp normalizes the number, creates a verifier, and sends a 6-digit OTP", async () => {
    const component = createMockComponent();
    const sendPhoneOtpSender = vi.fn().mockResolvedValue("sms_1");
    const { sendPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { sendPhoneOtp: sendPhoneOtpSender },
    );

    const ctx = createContext();
    const result = await exec(sendPhoneOtp).handler(ctx, {
      phone: "+1 (555) 123-4567 ",
      type: "sign-in",
      name: "Shlomo",
    });

    expect(result).toMatchObject({ status: "queued", messageId: "sms_1" });

    const createCall = component.native.verifiers.createVerifier.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({ type: "phone-otp" });
    expect(typeof createCall.verifierId).toBe("string");
    expect(JSON.parse(createCall.metadata).phone).toBe(PHONE);

    expect(sendPhoneOtpSender).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, type: "sign-in" }),
    );
    expect(sendPhoneOtpSender.mock.calls[0][0].otp).toMatch(/^\d{6}$/);
  });

  it("sendPhoneOtp rejects an invalid phone number", async () => {
    const component = createMockComponent();
    const { sendPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );

    await expect(
      exec(sendPhoneOtp).handler(createContext(), { phone: "555-1234" }),
    ).rejects.toThrow("Invalid phone number");
    expect(component.native.verifiers.createVerifier).not.toHaveBeenCalled();
  });

  it("sendPhoneOtp rejects when disabled", async () => {
    const component = createMockComponent();
    const { sendPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { ...createConfig(), enabled: false },
    );

    await expect(exec(sendPhoneOtp).handler(createContext(), { phone: PHONE })).rejects.toThrow(
      "Phone authentication is disabled",
    );
  });

  it("sendPhoneOtp rate-limits sends by default", async () => {
    const component = createMockComponent();
    const { sendPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );
    component.native.rateLimits.recordAttempt.mockResolvedValue({ allowed: false });

    await expect(exec(sendPhoneOtp).handler(createContext(), { phone: PHONE })).rejects.toThrow(
      "Too many requests",
    );
    expect(component.native.rateLimits.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `send-phone-otp:${PHONE}` }),
    );
  });

  it("rateLimit: false disables attempt recording", async () => {
    const component = createMockComponent();
    const { sendPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { ...createConfig(), rateLimit: false },
    );

    await exec(sendPhoneOtp).handler(createContext(), { phone: PHONE });
    expect(component.native.rateLimits.recordAttempt).not.toHaveBeenCalled();
  });

  it("verifyPhoneOtp provisions a phoneOtp identity and returns a session", async () => {
    const component = createMockComponent();
    const sendPhoneOtpSender = vi.fn().mockResolvedValue("sms_1");
    const { sendPhoneOtp, verifyPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { sendPhoneOtp: sendPhoneOtpSender },
    );

    const ctx = createContext();
    await exec(sendPhoneOtp).handler(ctx, { phone: PHONE, type: "sign-in" });
    const otp = sendPhoneOtpSender.mock.calls[0][0].otp;

    component.native.verifiers.consumeVerifier.mockResolvedValue({
      _id: "verifier_1",
      verifierId: "x",
      type: "phone-otp",
      metadata: JSON.stringify({ phone: PHONE, name: "Shlomo" }),
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    component.native.users.getUserByPhoneNumber.mockResolvedValue(null);
    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_1",
      identityId: "identity_1",
      createdUser: true,
      linkedExistingIdentity: false,
      token: "jwt_1",
      sessionId: "session_1",
      user: {
        _id: "user_1",
        phoneNumber: PHONE,
        phoneNumberVerified: true,
        name: "Shlomo",
        emailVerified: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });

    const result = await exec(verifyPhoneOtp).handler(ctx, { phone: PHONE, otp });

    expect(result).toMatchObject({
      token: "jwt_1",
      refreshToken: expect.any(String),
      sessionId: "session_1",
      userId: "user_1",
      identityId: "identity_1",
      user: { phoneNumber: PHONE, phoneNumberVerified: true },
    });

    const provisionCall = component.identity.provisionFromIdentity.mock.calls[0][0];
    expect(provisionCall.identity).toMatchObject({
      provider: "phoneOtp",
      issuer: "native",
      subject: PHONE,
    });
    expect(provisionCall.user).toMatchObject({
      phoneNumber: PHONE,
      phoneNumberVerified: true,
      name: "Shlomo",
    });
    expect(provisionCall.allowLink).toBe(true);
    expect(provisionCall.initialSession).toBeDefined();
  });

  it("verifyPhoneOtp rejects an invalid OTP", async () => {
    const component = createMockComponent();
    const { verifyPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );
    component.native.verifiers.consumeVerifier.mockResolvedValue(null);

    await expect(
      exec(verifyPhoneOtp).handler(createContext(), { phone: PHONE, otp: "000000" }),
    ).rejects.toThrow("INVALID_OTP");
  });

  it("verifyPhoneOtp respects disableSignUp", async () => {
    const component = createMockComponent();
    const { verifyPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { ...createConfig(), disableSignUp: true },
    );
    component.native.verifiers.consumeVerifier.mockResolvedValue({
      _id: "verifier_1",
      verifierId: "x",
      type: "phone-otp",
      metadata: JSON.stringify({ phone: PHONE }),
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    component.native.users.getUserByPhoneNumber.mockResolvedValue(null);

    await expect(
      exec(verifyPhoneOtp).handler(createContext(), { phone: PHONE, otp: "123456" }),
    ).rejects.toThrow("SIGN_UP_DISABLED");
    expect(component.identity.provisionFromIdentity).not.toHaveBeenCalled();
  });

  it("verifyPhoneOtp fails closed when the phone number collides with another user", async () => {
    const component = createMockComponent();
    const { verifyPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );
    component.native.verifiers.consumeVerifier.mockResolvedValue({
      _id: "verifier_1",
      verifierId: "x",
      type: "phone-otp",
      metadata: JSON.stringify({ phone: PHONE }),
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    component.native.users.getUserByPhoneNumber.mockResolvedValue({
      _id: "user_other",
      phoneNumber: PHONE,
    });
    component.identity.provisionFromIdentity.mockResolvedValue({
      userId: "user_other",
      createdUser: false,
      linkedExistingIdentity: false,
      duplicate: true,
      duplicateField: "phoneNumber",
      user: { _id: "user_other", phoneNumber: PHONE, emailVerified: false, isActive: true },
    });

    await expect(
      exec(verifyPhoneOtp).handler(createContext(), { phone: PHONE, otp: "123456" }),
    ).rejects.toThrow("Phone number is already in use");
  });

  it("sendPhoneOtp phone-verification requires a session and a matching stored number", async () => {
    const component = createMockComponent();
    const sendPhoneOtpSender = vi.fn().mockResolvedValue("sms_1");
    const { sendPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { sendPhoneOtp: sendPhoneOtpSender },
    );

    // No session → UNAUTHORIZED
    await expect(
      exec(sendPhoneOtp).handler(createContext(), {
        phone: PHONE,
        type: "phone-verification",
      }),
    ).rejects.toThrow("UNAUTHORIZED");

    // Session but mismatched stored number → refused
    const ctx = createContext({ userId: "user_1" });
    component.native.users.getUserById.mockResolvedValue({
      _id: "user_1",
      phoneNumber: "+19999999999",
    });
    await expect(
      exec(sendPhoneOtp).handler(ctx, { phone: PHONE, type: "phone-verification" }),
    ).rejects.toThrow("does not match");

    // Matching stored number → creates a phone_verification code
    component.native.users.getUserById.mockResolvedValue({
      _id: "user_1",
      phoneNumber: "+1 (555) 123-4567",
    });
    const result = await exec(sendPhoneOtp).handler(ctx, {
      phone: PHONE,
      type: "phone-verification",
    });
    expect(result).toMatchObject({ status: "queued" });
    expect(component.native.codes.createVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", type: "phone_verification" }),
    );
    expect(sendPhoneOtpSender).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, type: "phone-verification" }),
    );
  });

  it("verifyPhoneOtp phone-verification consumes the code via identity.verifyPhone", async () => {
    const component = createMockComponent();
    const sendPhoneOtpSender = vi.fn().mockResolvedValue("sms_1");
    const { sendPhoneOtp, verifyPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      { sendPhoneOtp: sendPhoneOtpSender },
    );

    const ctx = createContext({ userId: "user_1" });
    component.native.users.getUserById.mockResolvedValue({
      _id: "user_1",
      phoneNumber: PHONE,
    });
    component.identity.verifyPhone.mockResolvedValue({ success: true });

    await exec(sendPhoneOtp).handler(ctx, { phone: PHONE, type: "phone-verification" });
    const otp = sendPhoneOtpSender.mock.calls[0][0].otp;

    const result = await exec(verifyPhoneOtp).handler(ctx, {
      phone: PHONE,
      otp,
      type: "phone-verification",
    });

    expect(result).toMatchObject({ success: true });
    expect(component.identity.verifyPhone).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: expect.any(String) }),
    );
  });

  it("verifyPhoneOtp rate-limits attempts by default", async () => {
    const component = createMockComponent();
    const { verifyPhoneOtp } = nativePhone(
      component as unknown as NativeEmailAndPasswordComponentHandle,
      createConfig(),
    );
    component.native.rateLimits.recordAttempt.mockResolvedValue({ allowed: false });

    await expect(
      exec(verifyPhoneOtp).handler(createContext(), { phone: PHONE, otp: "123456" }),
    ).rejects.toThrow("Too many requests");
    expect(component.native.rateLimits.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `verify-phone-otp:${PHONE}` }),
    );
    expect(component.native.verifiers.consumeVerifier).not.toHaveBeenCalled();
  });
});
