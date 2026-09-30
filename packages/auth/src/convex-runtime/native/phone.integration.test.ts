/// <reference types="vite/client" />

import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { componentsGeneric } from "convex/server";
import rateLimiterTest from "@convex-dev/rate-limiter/test";

import convexAuthTest from "../../test.js";
import { nativePhone } from "./phone.js";
import { createConvexTwilioOtpSender } from "../providers/twilio.js";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";

/* Unlike phone.test.ts — which drives handlers with a hand-rolled ctx mock —
 * this file runs sendPhoneOtp through a real convex-test action ctx wired to
 * the registered convexAuth component (and its rateLimiter child). The point:
 * the calling action's ctx really reaches the component-backed OTP sender,
 * and the verifier write is a real component row. The component client's
 * sendMessage stands in for @convex-dev/twilio (duck-typed by design). */

const component = (componentsGeneric() as unknown as { convexAuth: unknown })
  .convexAuth as NativeEmailAndPasswordComponentHandle;

function exec(registered: unknown) {
  const handler = Reflect.get(registered as object, "_handler");
  return {
    handler: async (ctx: unknown, args: unknown): Promise<unknown> =>
      await Reflect.apply(handler as (...a: unknown[]) => unknown, registered, [ctx, args]),
  };
}

function makeConvex() {
  /* Empty root app — same pattern as oneTap.integration.test.ts. */
  const t = convexTest({
    modules: { "./convex/_generated/api.ts": () => Promise.resolve({}) },
  });
  convexAuthTest.register(t);
  rateLimiterTest.register(t as never, "convexAuth/rateLimiter");
  return t;
}

const PHONE = "+15551234567";

describe("sendPhoneOtp through the real component with a Twilio component sender", () => {
  it("forwards the real action ctx to sendMessage and writes a real verifier", async () => {
    const t = makeConvex();

    const sendMessage = vi.fn(async (_ctx: unknown, _args: unknown) => ({ sid: "SM_test_1" }));
    const sendPhoneOtp = createConvexTwilioOtpSender({ sendMessage });
    const { sendPhoneOtp: sendPhoneOtpAction } = nativePhone(component, { sendPhoneOtp });

    const result = (await t.action(
      async (ctx) =>
        await exec(sendPhoneOtpAction).handler(ctx, { phone: "+1 555-123-4567 ", type: "sign-in" }),
    )) as { status: string; messageId: string };

    expect(result).toMatchObject({ status: "queued", messageId: "SM_test_1" });

    // The sender received the real action ctx — runAction must be callable.
    const [ctxArg, argsArg] = sendMessage.mock.calls[0] as [
      { runAction: unknown },
      { to: string; body: string },
    ];
    expect(typeof ctxArg.runAction).toBe("function");
    expect(argsArg.to).toBe(PHONE);
    expect(argsArg.body).toMatch(/\d{6}/);

    // The verifier was actually written in the component's tables.
    const verifiers = (await t.runInComponent("convexAuth", async (ctx) =>
      (ctx.db.query as (name: string) => { collect(): Promise<unknown[]> })(
        "authVerifiers",
      ).collect(),
    )) as { type: string }[];
    expect(verifiers).toHaveLength(1);
    expect(verifiers[0].type).toBe("phone-otp");
  });

  it("a from-required client compiles only with options.from", async () => {
    const sendMessage = vi.fn(
      async (_ctx: unknown, args: { to: string; body: string; from: string }) => ({
        sid: `SM_${args.from}`,
      }),
    );
    // TwilioComponentClientRequiringFrom — options.from is mandatory.
    const sendPhoneOtp = createConvexTwilioOtpSender({ sendMessage }, { from: "+15559990000" });
    const t = makeConvex();
    const { sendPhoneOtp: sendPhoneOtpAction } = nativePhone(component, { sendPhoneOtp });

    const result = (await t.action(
      async (ctx) => await exec(sendPhoneOtpAction).handler(ctx, { phone: PHONE, type: "sign-in" }),
    )) as { status: string; messageId: string };

    expect(result.messageId).toBe("SM_+15559990000");
    expect(sendMessage.mock.calls[0][1]).toMatchObject({ to: PHONE, from: "+15559990000" });
  });
});
