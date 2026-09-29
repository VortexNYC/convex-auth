import { v } from "convex/values";

export const organizationStatusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("deleted"),
);

export const organizationMemberStatusValidator = v.union(
  v.literal("active"),
  v.literal("invited"),
  v.literal("suspended"),
);

export const organizationInvitationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("revoked"),
  v.literal("expired"),
);

export const invitationEmailDeliveryStatusValidator = v.union(
  v.literal("not_configured"),
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delivery_delayed"),
  v.literal("bounced"),
  v.literal("failed"),
);

export const emailTwoFactorStatusValidator = v.union(
  v.literal("disabled"),
  v.literal("enabled"),
  v.literal("reset_required"),
);

export const emailTwoFactorResetReasonValidator = v.union(
  v.literal("missing_email"),
  v.literal("email_not_verified"),
  v.literal("email_changed"),
);

export const apiKeyStatusValidator = v.union(v.literal("active"), v.literal("revoked"));

/**
 * Sandbox vs production is deliberately a TYPED COLUMN, not a scope string or metadata.
 *
 * Some legacy api-key plugins carry this in free-form `metadata`; this is the
 * one place we diverge from that pattern: this field decides whether a request moves real money, so
 * it must be indexable and impossible to typo. A key issued for sandbox must never
 * authenticate a production request.
 */
export const apiKeyEnvironmentValidator = v.union(v.literal("sandbox"), v.literal("production"));

export const apiKeyOwnerTypeValidator = v.union(
  v.literal("user"),
  v.literal("organization"),
  v.literal("service"),
);

export const servicePrincipalStatusValidator = v.union(v.literal("active"), v.literal("disabled"));

export const agentModeValidator = v.union(v.literal("delegated"), v.literal("autonomous"));

export const agentHostStatusValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("revoked"),
  v.literal("rejected"),
);

export const agentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked"),
  v.literal("rejected"),
);

export const agentKeyStatusValidator = v.union(
  v.literal("active"),
  v.literal("rotated"),
  v.literal("revoked"),
);

export const agentCapabilityGrantStatusValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("denied"),
  v.literal("revoked"),
);

export const agentDeviceAuthorizationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
  v.literal("expired"),
);

export const agentAuthAuditActorTypeValidator = v.union(
  v.literal("user"),
  v.literal("host"),
  v.literal("agent"),
  v.literal("system"),
);

export const authMdRegistrationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("claimed"),
  v.literal("expired"),
  v.literal("revoked"),
);

export const authMdAssertionStatusValidator = v.union(
  v.literal("active"),
  v.literal("consumed"),
  v.literal("revoked"),
);

export const authMdCredentialStatusValidator = v.union(v.literal("active"), v.literal("revoked"));

export const verificationCodeTypeValidator = v.union(
  v.literal("email_verification"),
  v.literal("password_reset"),
  v.literal("email_change"),
  v.literal("phone_verification"),
  v.literal("two_factor_pending"),
  v.literal("two_factor_trusted_device"),
);

export const authMdAuditActorTypeValidator = v.union(
  v.literal("external"),
  v.literal("user"),
  v.literal("credential"),
  v.literal("system"),
);

export const authAuditActorTypeValidator = v.union(
  v.literal("anonymous"),
  v.literal("user"),
  v.literal("machine"),
  v.literal("service"),
  v.literal("system"),
);

export const webhookEndpointStatusValidator = v.union(
  v.literal("active"),
  v.literal("disabled"),
  v.literal("archived"),
);

export const webhookDeliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("delivered"),
  v.literal("failed"),
);

export const webhookFailureKindValidator = v.union(
  v.literal("endpoint_inactive"),
  v.literal("network_error"),
  v.literal("rate_limited"),
  v.literal("server_error"),
  v.literal("client_error"),
  v.literal("unknown_error"),
);
