import { describe, expect, it, vi } from "vitest";
import {
  createConvexTwilioOtpSender,
  createTwilioSmsOtpSender,
  createTwilioSmsSender,
} from "./twilio.js";

type CapturedRequest = {
  url: string;
  init: RequestInit;
};

function captureFetch() {
  let captured: CapturedRequest | undefined;
  const fetch = async (url: string, init: RequestInit) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ sid: "SMtest", status: "queued" }),
    } as unknown as Response;
  };
  return { fetch, getRequest: () => captured };
}

function captureFetchError(status: number, body: unknown) {
  return async () =>
    ({
      ok: false,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    }) as unknown as Response;
}

describe("createTwilioSmsSender", () => {
  it("sends an SMS with the Twilio Messages API", async () => {
    const { fetch, getRequest } = captureFetch();
    const send = createTwilioSmsSender({
      accountSid: "ACtest",
      authToken: "authtoken",
      from: "+15551234567",
      fetch,
    });

    const sid = await send({ to: "+15559876543", body: "Hello" });

    expect(sid).toBe("SMtest");
    const request = getRequest();
    expect(request).toBeDefined();
    expect(request!.url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    expect(request!.init.method).toBe("POST");

    const headers = request!.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers["Authorization"]).toMatch(/^Basic /);

    const body = new URLSearchParams(request!.init.body as string);
    expect(body.get("To")).toBe("+15559876543");
    expect(body.get("From")).toBe("+15551234567");
    expect(body.get("Body")).toBe("Hello");
    expect(body.has("MessagingServiceSid")).toBe(false);
  });

  it("uses a messaging service SID when the from value starts with MG", async () => {
    const { fetch, getRequest } = captureFetch();
    const send = createTwilioSmsSender({
      accountSid: "ACtest",
      authToken: "authtoken",
      from: "MGtestservice",
      fetch,
    });

    await send({ to: "+15559876543", body: "Hello" });

    const body = new URLSearchParams(getRequest()!.init.body as string);
    expect(body.get("MessagingServiceSid")).toBe("MGtestservice");
    expect(body.has("From")).toBe(false);
  });

  it("allows per-message from override", async () => {
    const { fetch, getRequest } = captureFetch();
    const send = createTwilioSmsSender({
      accountSid: "ACtest",
      authToken: "authtoken",
      from: "+15551234567",
      fetch,
    });

    await send({ to: "+15559876543", body: "Hello", from: "+15551111111" });

    const body = new URLSearchParams(getRequest()!.init.body as string);
    expect(body.get("From")).toBe("+15551111111");
  });

  it("throws on non-2xx responses", async () => {
    const send = createTwilioSmsSender({
      accountSid: "ACtest",
      authToken: "authtoken",
      from: "+15551234567",
      fetch: captureFetchError(400, {
        error_message: "To phone number cannot be reached",
      }),
    });

    await expect(send({ to: "+15559876543", body: "Hello" })).rejects.toThrow(
      "Twilio SMS send failed (400): To phone number cannot be reached",
    );
  });

  it("encodes Basic auth without btoa", async () => {
    const { fetch, getRequest } = captureFetch();
    const send = createTwilioSmsSender({
      accountSid: "ACtest",
      authToken: "authtoken",
      from: "+15551234567",
      fetch,
    });

    await send({ to: "+15559876543", body: "Hello" });

    const request = getRequest();
    expect(request).toBeDefined();
    const headers = request!.init.headers as Record<string, string>;
    const value = Buffer.from((headers["Authorization"] as string).slice(6), "base64").toString(
      "utf-8",
    );
    expect(value).toBe("ACtest:authtoken");
  });
});

describe("createTwilioSmsOtpSender", () => {
  it("sends an OTP SMS with a default message", async () => {
    const { fetch, getRequest } = captureFetch();
    const send = createTwilioSmsOtpSender({
      accountSid: "ACtest",
      authToken: "authtoken",
      from: "+15551234567",
      fetch,
    });

    const sid = await send({ phone: "+15559876543", otp: "123456", type: "sign-in" }, {} as never);

    expect(sid).toBe("SMtest");
    const body = new URLSearchParams(getRequest()!.init.body as string);
    expect(body.get("To")).toBe("+15559876543");
    expect(body.get("Body")).toBe("Your sign-in code is: 123456");
  });

  it("uses a custom message builder", async () => {
    const { fetch, getRequest } = captureFetch();
    const send = createTwilioSmsOtpSender({
      accountSid: "ACtest",
      authToken: "authtoken",
      from: "+15551234567",
      fetch,
      buildMessage: (otp, type) => `[${type}] ${otp}`,
    });

    await send({ phone: "+15559876543", otp: "987654", type: "verify" }, {} as never);

    const body = new URLSearchParams(getRequest()!.init.body as string);
    expect(body.get("Body")).toBe("[verify] 987654");
  });
});

describe("createConvexTwilioOtpSender", () => {
  it("delegates to the component client's sendMessage and returns the sid", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ sid: "SMcomponent", status: "queued" });
    const send = createConvexTwilioOtpSender({ sendMessage });
    const ctx = { marker: "action-ctx" };

    const sid = await send({ phone: "+15559876543", otp: "123456", type: "sign-in" }, ctx as never);

    expect(sid).toBe("SMcomponent");
    expect(sendMessage).toHaveBeenCalledWith(ctx, {
      to: "+15559876543",
      body: "Your sign-in code is: 123456",
    });
  });

  it("passes the from override through to the component", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ sid: "SMcomponent" });
    const send = createConvexTwilioOtpSender({ sendMessage }, { from: "+15550001111" });

    await send({ phone: "+15559876543", otp: "123456", type: "phone-verification" }, {} as never);

    expect(sendMessage).toHaveBeenCalledWith(expect.anything(), {
      to: "+15559876543",
      body: "Your phone verification code is: 123456",
      from: "+15550001111",
    });
  });
});
