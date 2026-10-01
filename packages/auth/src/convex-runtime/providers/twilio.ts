/**
 * First-party Twilio SMS sender for Convex actions.
 *
 * These helpers use the Twilio Programmable Messaging REST API directly via
 * `fetch`, so they work in Convex `action` handlers without any Node SDK. API
 * credentials should live in Convex environment variables, not source code.
 */
import type { GenericActionCtx, GenericDataModel } from "convex/server";

export type TwilioSmsDraft = {
  /** Recipient phone number in E.164 format. */
  to: string;
  /** Message body. Messages longer than 1600 characters will fail at Twilio. */
  body: string;
  /** Optional override. Defaults to the sender's `from` or `messagingServiceSid`. */
  from?: string;
};

export type SmsSender = (draft: TwilioSmsDraft) => Promise<string>;

/**
 * The action context surface OTP senders may use — the same
 * `Pick<GenericActionCtx<GenericDataModel>, ...>` convention the official
 * `@convex-dev/twilio` client uses for its `ctx` parameters. Any concrete
 * action ctx is assignable to it; narrower members like `db`/`auth` are
 * intentionally excluded since cross-component ctx isn't fully assignable.
 */
export type PhoneOtpActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

export type PhoneOtpSender = (
  data: {
    phone: string;
    otp: string;
    type: string;
  },
  ctx: PhoneOtpActionCtx,
) => Promise<string>;

export type TwilioSmsSenderOptions = {
  /** Twilio Account SID. */
  accountSid: string;
  /** Twilio Auth Token. */
  authToken: string;
  /** Default Twilio phone number or Messaging Service SID to send from. */
  from: string;
  /** Optional `fetch` implementation for testing or custom runtimes. */
  fetch?: typeof fetch;
};

export type TwilioMessageResponse = {
  sid: string;
  status: string;
  error_message?: string;
};

function isMessagingServiceSid(value: string): boolean {
  return value.startsWith("MG");
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function stringToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const chunk = (a << 16) | (b << 8) | c;
    result += BASE64_CHARS[(chunk >> 18) & 63];
    result += BASE64_CHARS[(chunk >> 12) & 63];
    result += i + 1 < bytes.length ? BASE64_CHARS[(chunk >> 6) & 63] : "=";
    result += i + 2 < bytes.length ? BASE64_CHARS[chunk & 63] : "=";
  }
  return result;
}

/**
 * Create a first-party Twilio {@link SmsSender} for Convex actions.
 *
 * The returned function POSTs to the Twilio Messages API and returns the
 * message SID. Non-2xx responses are thrown as `Error` with the Twilio error
 * message when available.
 */
export function createTwilioSmsSender(options: TwilioSmsSenderOptions): SmsSender {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const credentials = stringToBase64(`${options.accountSid}:${options.authToken}`);

  return async (draft: TwilioSmsDraft) => {
    const from = draft.from ?? options.from;
    if (!from) {
      throw new Error("Twilio SMS sender requires a 'from' number or messaging service SID");
    }

    const params = new URLSearchParams();
    params.append("To", draft.to);
    params.append("Body", draft.body);
    if (isMessagingServiceSid(from)) {
      params.append("MessagingServiceSid", from);
    } else {
      params.append("From", from);
    }

    const response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${options.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const result = (await response.json()) as TwilioMessageResponse;

    if (!response.ok) {
      throw new Error(
        `Twilio SMS send failed (${response.status}): ${result.error_message ?? JSON.stringify(result)}`,
      );
    }

    return result.sid;
  };
}

function defaultSmsOtpMessage(otp: string, type: string): string {
  switch (type) {
    case "sign-in":
      return `Your sign-in code is: ${otp}`;
    case "phone-verification":
      return `Your phone verification code is: ${otp}`;
    case "password-reset":
      return `Your password reset code is: ${otp}`;
    default:
      return `Your verification code is: ${otp}`;
  }
}

export type TwilioSmsOtpSenderOptions = TwilioSmsSenderOptions & {
  /** Optional message builder. Defaults to a type-specific plain-text message. */
  buildMessage?: (otp: string, type: string) => string;
};

/**
 * Create a first-party Twilio {@link PhoneOtpSender} for Convex actions.
 *
 * This wraps {@link createTwilioSmsSender} and renders a minimal OTP SMS from
 * the `otp` and `type` fields.
 */
export function createTwilioSmsOtpSender(options: TwilioSmsOtpSenderOptions): PhoneOtpSender {
  const send = createTwilioSmsSender(options);
  const buildMessage = options.buildMessage ?? defaultSmsOtpMessage;

  return async ({ phone, otp, type }) => {
    return await send({
      to: phone,
      body: buildMessage(otp, type),
    });
  };
}

/**
 * Minimal surface of the `@convex-dev/twilio` component's `Twilio` client —
 * the object returned by `new Twilio(components.twilio, {...})`. Duck-typed
 * so consumers get the adapter without the package becoming a hard dep.
 * Matches the real client when `defaultFrom` was configured (its `sendMessage`
 * takes `from?`); clients without `defaultFrom` need `TwilioComponentClientRequiringFrom`.
 */
export type TwilioComponentClient = {
  sendMessage: (
    ctx: PhoneOtpActionCtx,
    args: { to: string; body: string; from?: string },
  ) => Promise<{ sid: string }>;
};

/** A component client constructed without `defaultFrom` — `sendMessage` requires `from` per call. */
export type TwilioComponentClientRequiringFrom = {
  sendMessage: (
    ctx: PhoneOtpActionCtx,
    args: { to: string; body: string; from: string },
  ) => Promise<{ sid: string }>;
};

export type ConvexTwilioOtpSenderOptions = {
  /** Override the component client's `defaultFrom`. */
  from?: string;
  /** Optional message builder. Defaults to a type-specific plain-text message. */
  buildMessage?: (otp: string, type: string) => string;
};

/**
 * OTP sender backed by the official `@convex-dev/twilio` component — each
 * send is a single `sendMessage` request that the component records in its
 * own tables; delivery status is tracked there when the component's Twilio
 * webhook is registered. Throws if the send fails; the OTP verifier expires
 * on its normal TTL and a new code can be requested.
 *
 * Requires `app.use(twilio)` in `convex/convex.config.ts` and
 * `new Twilio(components.twilio, { defaultFrom })` — see the phone docs.
 *
 * Overloads mirror the real client's typing: when the client was built
 * without `defaultFrom`, `from` must be supplied here via options.
 */
export function createConvexTwilioOtpSender(
  twilio: TwilioComponentClient,
  options?: ConvexTwilioOtpSenderOptions,
): PhoneOtpSender;
export function createConvexTwilioOtpSender(
  twilio: TwilioComponentClientRequiringFrom,
  options: ConvexTwilioOtpSenderOptions & { from: string },
): PhoneOtpSender;
export function createConvexTwilioOtpSender(
  twilio: TwilioComponentClient | TwilioComponentClientRequiringFrom,
  options?: ConvexTwilioOtpSenderOptions,
): PhoneOtpSender {
  const buildMessage = options?.buildMessage ?? defaultSmsOtpMessage;
  // Overload 2 already forces `options.from` for clients whose sendMessage
  // requires it, so the optional-from view is safe inside the impl.
  const client = twilio as TwilioComponentClient;

  return async ({ phone, otp, type }, ctx) => {
    const message = await client.sendMessage(ctx, {
      to: phone,
      body: buildMessage(otp, type),
      ...(options?.from ? { from: options.from } : {}),
    });
    return message.sid;
  };
}
