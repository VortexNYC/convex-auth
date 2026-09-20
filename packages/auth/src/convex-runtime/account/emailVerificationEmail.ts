import {
  buildTokenUrl,
  mapResendAccountEmailDelivery,
  type AccountEmailDeliveryStatus,
  type ResendAccountEmailEvent,
} from "./emailShared";

export type EmailVerificationEmailDeliveryStatus = AccountEmailDeliveryStatus;

export type EmailVerificationEmailDeliveryResult =
  | {
      status: "not_configured";
      reason: "missing_from_address" | "missing_verify_url";
    }
  | {
      status: "queued";
      emailId: string;
    }
  | {
      status: "failed";
      reason: string;
    };

export type EmailVerificationEmailNotConfiguredReason = Extract<
  EmailVerificationEmailDeliveryResult,
  { status: "not_configured" }
>["reason"];

export type EmailVerificationEmailDraft = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailVerificationEmailContext = {
  email: string;
  expiresAt?: number;
};

export type EmailVerificationEmailDeliveryPatch = {
  emailId?: string;
  emailDeliveryStatus: EmailVerificationEmailDeliveryStatus;
  emailDeliveryEvent: string;
  emailDeliveryError?: string;
  emailDeliveryUpdatedAt: number;
};

export type ResendVerificationEmailEvent = ResendAccountEmailEvent;

export function buildEmailVerificationUrl(args: {
  token: string;
  templateUrl?: string | null;
  appOrigin?: string | null;
  verifyPath?: string;
}): string | null {
  return buildTokenUrl({
    token: args.token,
    templateUrl: args.templateUrl,
    appOrigin: args.appOrigin,
    path: args.verifyPath ?? "/verify-email",
  });
}

export async function createEmailVerificationEmailDraft(args: {
  from?: string | null;
  to: string;
  verifyUrl: string | null;
  expiresAt?: number;
}): Promise<
  | EmailVerificationEmailDraft
  | Extract<EmailVerificationEmailDeliveryResult, { status: "not_configured" }>
> {
  const from = args.from?.trim();
  if (!from || from.length === 0) {
    return { status: "not_configured", reason: "missing_from_address" };
  }
  if (args.verifyUrl === null) {
    return { status: "not_configured", reason: "missing_verify_url" };
  }

  const { html, text } = buildEmailVerificationEmail(args.verifyUrl, args.expiresAt);

  return {
    from,
    to: args.to,
    subject: "Verify your email",
    html,
    text,
  };
}

export function resolveEmailVerificationFromAddress(args: {
  primary?: string | null;
  fallback?: string | null;
}): string | null {
  for (const value of [args.primary, args.fallback]) {
    const normalized = value?.trim();
    if (normalized && normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

export function createEmailVerificationEmailQueuedPatch(args: {
  emailId: string;
  now?: number;
}): EmailVerificationEmailDeliveryPatch {
  return {
    emailId: args.emailId,
    emailDeliveryStatus: "queued",
    emailDeliveryEvent: "queued",
    emailDeliveryError: undefined,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export function createEmailVerificationEmailNotConfiguredPatch(args: {
  reason: EmailVerificationEmailNotConfiguredReason;
  now?: number;
}): EmailVerificationEmailDeliveryPatch {
  return {
    emailDeliveryStatus: "not_configured",
    emailDeliveryEvent: args.reason,
    emailDeliveryError: undefined,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export function createEmailVerificationEmailFailedPatch(args: {
  reason: string;
  now?: number;
}): EmailVerificationEmailDeliveryPatch {
  return {
    emailDeliveryStatus: "failed",
    emailDeliveryEvent: "enqueue_failed",
    emailDeliveryError: args.reason,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export function createEmailVerificationEmailEventPatch(args: {
  event: ResendVerificationEmailEvent;
  now?: number;
}): EmailVerificationEmailDeliveryPatch {
  const delivery = mapResendEventToVerificationEmailDelivery({
    event: args.event,
  });
  return {
    emailDeliveryStatus: delivery.status,
    emailDeliveryEvent: delivery.eventType,
    emailDeliveryError: delivery.error,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export async function sendEmailVerificationEmail(args: {
  token: string;
  account: EmailVerificationEmailContext | null;
  from?: string | null;
  templateUrl?: string | null;
  appOrigin?: string | null;
  verifyPath?: string;
  sendEmail: (draft: EmailVerificationEmailDraft) => Promise<string>;
  recordQueued: (emailId: string) => Promise<EmailVerificationEmailDeliveryResult>;
  recordNotConfigured: (
    reason: EmailVerificationEmailNotConfiguredReason,
  ) => Promise<EmailVerificationEmailDeliveryResult>;
  recordFailed: (reason: string) => Promise<EmailVerificationEmailDeliveryResult>;
  renderEmailDraft?: (args: {
    from: string;
    to: string;
    verifyUrl: string;
    expiresAt?: number;
  }) => Promise<EmailVerificationEmailDraft>;
}): Promise<EmailVerificationEmailDeliveryResult> {
  if (args.account === null) {
    return await args.recordFailed("Account not found");
  }

  const verifyUrl = buildEmailVerificationUrl({
    token: args.token,
    templateUrl: args.templateUrl,
    appOrigin: args.appOrigin,
    verifyPath: args.verifyPath,
  });

  const transportDraft = await createEmailVerificationEmailDraft({
    from: args.from,
    to: args.account.email,
    verifyUrl,
    expiresAt: args.account.expiresAt,
  });

  if ("status" in transportDraft) {
    return await args.recordNotConfigured(transportDraft.reason);
  }

  if (verifyUrl === null) {
    return await args.recordNotConfigured("missing_verify_url");
  }

  try {
    const emailDraft =
      args.renderEmailDraft === undefined
        ? transportDraft
        : await args.renderEmailDraft({
            from: transportDraft.from,
            to: transportDraft.to,
            verifyUrl,
            expiresAt: args.account.expiresAt,
          });
    const emailId = await args.sendEmail(emailDraft);
    return await args.recordQueued(emailId);
  } catch (error) {
    return await args.recordFailed(
      error instanceof Error ? error.message : "Unknown email delivery error",
    );
  }
}

export function mapResendEventToVerificationEmailDelivery(args: {
  event: ResendVerificationEmailEvent;
}): {
  status: Exclude<EmailVerificationEmailDeliveryStatus, "not_configured" | "queued">;
  eventType: ResendVerificationEmailEvent["type"];
  error?: string;
} {
  return mapResendAccountEmailDelivery({ event: args.event });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailVerificationEmail(
  verifyUrl: string,
  expiresAt?: number,
): { html: string; text: string } {
  const expirationText =
    expiresAt === undefined ? "" : `\n\nThis link expires ${new Date(expiresAt).toUTCString()}.`;
  const expirationHtml =
    expiresAt === undefined ? "" : `<p>This link expires ${new Date(expiresAt).toUTCString()}.</p>`;

  const text = `Verify your email\n\nConfirm your email address to finish setting up your account.\n\nVerify your email: ${verifyUrl}${expirationText}`;
  const html = `<!doctype html>
<html>
  <head><title>Verify your email</title></head>
  <body style="font-family:sans-serif;padding:24px;">
    <p>Confirm your email address to finish setting up your account.</p>
    <p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:12px 24px;background-color:#111;color:#fff;border-radius:6px;text-decoration:none;">Verify your email</a></p>
    ${expirationHtml}
  </body>
</html>`;

  return { html, text };
}
