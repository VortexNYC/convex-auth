import {
  buildTokenUrl,
  mapResendAccountEmailDelivery,
  type AccountEmailDeliveryStatus,
  type ResendAccountEmailEvent,
} from "./emailShared";

export type PasswordResetEmailDeliveryStatus = AccountEmailDeliveryStatus;

export type PasswordResetEmailDeliveryResult =
  | {
      status: "not_configured";
      reason: "missing_from_address" | "missing_reset_url";
    }
  | {
      status: "queued";
      emailId: string;
    }
  | {
      status: "failed";
      reason: string;
    };

export type PasswordResetEmailNotConfiguredReason = Extract<
  PasswordResetEmailDeliveryResult,
  { status: "not_configured" }
>["reason"];

export type PasswordResetEmailDraft = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type PasswordResetEmailContext = {
  email: string;
  expiresAt?: number;
};

export type PasswordResetEmailDeliveryPatch = {
  emailId?: string;
  emailDeliveryStatus: PasswordResetEmailDeliveryStatus;
  emailDeliveryEvent: string;
  emailDeliveryError?: string;
  emailDeliveryUpdatedAt: number;
};

export type ResendPasswordResetEmailEvent = ResendAccountEmailEvent;

export function buildPasswordResetUrl(args: {
  token: string;
  templateUrl?: string | null;
  appOrigin?: string | null;
  resetPath?: string;
}): string | null {
  return buildTokenUrl({
    token: args.token,
    templateUrl: args.templateUrl,
    appOrigin: args.appOrigin,
    path: args.resetPath ?? "/reset-password",
  });
}

export async function createPasswordResetEmailDraft(args: {
  from?: string | null;
  to: string;
  resetUrl: string | null;
  expiresAt?: number;
}): Promise<
  PasswordResetEmailDraft | Extract<PasswordResetEmailDeliveryResult, { status: "not_configured" }>
> {
  const from = args.from?.trim();
  if (!from || from.length === 0) {
    return { status: "not_configured", reason: "missing_from_address" };
  }
  if (args.resetUrl === null) {
    return { status: "not_configured", reason: "missing_reset_url" };
  }

  const { html, text } = buildPasswordResetEmail(args.resetUrl, args.expiresAt);

  return {
    from,
    to: args.to,
    subject: "Reset your password",
    html,
    text,
  };
}

export function resolvePasswordResetFromAddress(args: {
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

export function createPasswordResetEmailQueuedPatch(args: {
  emailId: string;
  now?: number;
}): PasswordResetEmailDeliveryPatch {
  return {
    emailId: args.emailId,
    emailDeliveryStatus: "queued",
    emailDeliveryEvent: "queued",
    emailDeliveryError: undefined,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export function createPasswordResetEmailNotConfiguredPatch(args: {
  reason: PasswordResetEmailNotConfiguredReason;
  now?: number;
}): PasswordResetEmailDeliveryPatch {
  return {
    emailDeliveryStatus: "not_configured",
    emailDeliveryEvent: args.reason,
    emailDeliveryError: undefined,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export function createPasswordResetEmailFailedPatch(args: {
  reason: string;
  now?: number;
}): PasswordResetEmailDeliveryPatch {
  return {
    emailDeliveryStatus: "failed",
    emailDeliveryEvent: "enqueue_failed",
    emailDeliveryError: args.reason,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export function createPasswordResetEmailEventPatch(args: {
  event: ResendPasswordResetEmailEvent;
  now?: number;
}): PasswordResetEmailDeliveryPatch {
  const delivery = mapResendEventToPasswordResetEmailDelivery({
    event: args.event,
  });
  return {
    emailDeliveryStatus: delivery.status,
    emailDeliveryEvent: delivery.eventType,
    emailDeliveryError: delivery.error,
    emailDeliveryUpdatedAt: args.now ?? Date.now(),
  };
}

export async function sendPasswordResetEmail(args: {
  token: string;
  account: PasswordResetEmailContext | null;
  from?: string | null;
  templateUrl?: string | null;
  appOrigin?: string | null;
  resetPath?: string;
  sendEmail: (draft: PasswordResetEmailDraft) => Promise<string>;
  recordQueued: (emailId: string) => Promise<PasswordResetEmailDeliveryResult>;
  recordNotConfigured: (
    reason: PasswordResetEmailNotConfiguredReason,
  ) => Promise<PasswordResetEmailDeliveryResult>;
  recordFailed: (reason: string) => Promise<PasswordResetEmailDeliveryResult>;
  renderEmailDraft?: (args: {
    from: string;
    to: string;
    resetUrl: string;
    expiresAt?: number;
  }) => Promise<PasswordResetEmailDraft>;
}): Promise<PasswordResetEmailDeliveryResult> {
  if (args.account === null) {
    return await args.recordFailed("Account not found");
  }

  const resetUrl = buildPasswordResetUrl({
    token: args.token,
    templateUrl: args.templateUrl,
    appOrigin: args.appOrigin,
    resetPath: args.resetPath,
  });

  const transportDraft = await createPasswordResetEmailDraft({
    from: args.from,
    to: args.account.email,
    resetUrl,
    expiresAt: args.account.expiresAt,
  });

  if ("status" in transportDraft) {
    return await args.recordNotConfigured(transportDraft.reason);
  }

  if (resetUrl === null) {
    return await args.recordNotConfigured("missing_reset_url");
  }

  try {
    const emailDraft =
      args.renderEmailDraft === undefined
        ? transportDraft
        : await args.renderEmailDraft({
            from: transportDraft.from,
            to: transportDraft.to,
            resetUrl,
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

export function mapResendEventToPasswordResetEmailDelivery(args: {
  event: ResendPasswordResetEmailEvent;
}): {
  status: Exclude<PasswordResetEmailDeliveryStatus, "not_configured" | "queued">;
  eventType: ResendPasswordResetEmailEvent["type"];
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

function buildPasswordResetEmail(
  resetUrl: string,
  expiresAt?: number,
): { html: string; text: string } {
  const expirationText =
    expiresAt === undefined ? "" : `\n\nThis link expires ${new Date(expiresAt).toUTCString()}.`;
  const expirationHtml =
    expiresAt === undefined ? "" : `<p>This link expires ${new Date(expiresAt).toUTCString()}.</p>`;

  const text = `Reset your password\n\nWe received a request to reset your password.\n\nReset your password: ${resetUrl}\n\nIf you did not request this, you can safely ignore this email.${expirationText}`;
  const html = `<!doctype html>
<html>
  <head><title>Reset your password</title></head>
  <body style="font-family:sans-serif;padding:24px;">
    <p>We received a request to reset your password.</p>
    <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 24px;background-color:#111;color:#fff;border-radius:6px;text-decoration:none;">Reset your password</a></p>
    <p>If you did not request this, you can safely ignore this email.</p>
    ${expirationHtml}
  </body>
</html>`;

  return { html, text };
}
