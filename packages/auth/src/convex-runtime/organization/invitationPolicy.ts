import { buildInvitationAcceptUrl } from "./invitationEmail";
import { wouldRemoveLastActiveOwner } from "./membershipPolicy";

export const INVITATION_DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_INVITATION_EXPIRES_IN_DAYS = 7;

export type OrganizationInvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type OrganizationMemberLifecycleStatus = "active" | "suspended";
export type OrganizationMemberPolicyStatus = "active" | "inactive" | "pending" | "suspended";
export type OrganizationRoleTemplate = "owner" | "admin" | "manager" | "member" | "viewer";

export type OrganizationInvitationPolicyErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "ALREADY_EXISTS"
  | "FAILED_PRECONDITION";

export class OrganizationInvitationPolicyError extends Error {
  code: OrganizationInvitationPolicyErrorCode;

  constructor(args: { code: OrganizationInvitationPolicyErrorCode; message: string }) {
    super(args.message);
    this.name = "OrganizationInvitationPolicyError";
    this.code = args.code;
  }
}

export function hasDuplicatePendingInvitation(args: {
  invitations: Array<{
    email: string;
    status: OrganizationInvitationStatus;
  }>;
  email: string;
}): boolean {
  const normalizedEmail = normalizeInvitationEmail(args.email);

  return args.invitations.some(
    (invitation) =>
      invitation.status === "pending" &&
      normalizeInvitationEmail(invitation.email) === normalizedEmail,
  );
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getInvitationEmailValidationError(email: string): string | null {
  const normalizedEmail = normalizeInvitationEmail(email);
  if (normalizedEmail.length === 0) {
    return "Email required";
  }
  return null;
}

export function computeInvitationExpiresAt(args: { now: number; expiresInDays?: number }): number {
  return (
    args.now +
    Math.max(1, args.expiresInDays ?? DEFAULT_INVITATION_EXPIRES_IN_DAYS) * INVITATION_DAY_MS
  );
}

export function findInvitationEmailByToken(
  organizations: ReadonlyArray<{
    invitations: Array<{
      id: string;
      emailAddress?: string | null;
    }>;
  }>,
  invitationToken: string,
): string | null {
  for (const organization of organizations) {
    const invitation = organization.invitations.find((item) => item.id === invitationToken);
    if (invitation) {
      return invitation.emailAddress ?? null;
    }
  }

  return null;
}

export function buildInvitationRequest<TOrganizationId extends string>(args: {
  organizationId: TOrganizationId;
  email: string;
  roleTemplate: OrganizationRoleTemplate;
}): {
  organizationId: TOrganizationId;
  email: string;
  roleTemplate: OrganizationRoleTemplate;
} {
  return {
    organizationId: args.organizationId,
    email: normalizeInvitationEmail(args.email),
    roleTemplate: args.roleTemplate,
  };
}

export function assertOrganizationScope<TOrganizationId extends string>(args: {
  activeOrganizationId: TOrganizationId | null;
  authorizedOrganizationId: TOrganizationId;
  requestedOrganizationId: TOrganizationId;
}): void {
  if (
    !args.activeOrganizationId ||
    args.activeOrganizationId !== args.requestedOrganizationId ||
    args.authorizedOrganizationId !== args.requestedOrganizationId
  ) {
    throw new OrganizationInvitationPolicyError({
      code: "FORBIDDEN",
      message: "Organization scope mismatch",
    });
  }
}

export function assertCanInviteMember<TOrganizationId extends string>(args: {
  activeOrganizationId: TOrganizationId | null;
  requestedOrganizationId: TOrganizationId;
}): void {
  if (!args.activeOrganizationId || args.activeOrganizationId !== args.requestedOrganizationId) {
    throw new OrganizationInvitationPolicyError({
      code: "FORBIDDEN",
      message: "Organization scope mismatch",
    });
  }
}

export type CreateOrganizationInvitationResult<TInvitationId extends string> = {
  ok: true;
  invitationId: TInvitationId;
  token: string;
  acceptUrl: string;
};

export type CreateOrganizationInvitationArgs<
  TOrganizationId extends string,
  TUserId extends string,
  TInvitationId extends string,
  /**
   * The role carried by the invitation. Defaults to the built-in template
   * union for convenience, but any consumer that seeds a custom role catalog
   * into the convexAuth component (the system stores invitations by `roleId`,
   * not a fixed union) passes its OWN role keys here — e.g. Aqua's "owner" |
   * "accountant" | "viewer". The role flows straight through to
   * `insertInvitation`, which maps it to the catalog roleId.
   */
  TRole extends string = OrganizationRoleTemplate,
> = {
  organizationId: TOrganizationId;
  authorizedOrganizationId: TOrganizationId;
  viewer: {
    user: {
      _id: TUserId;
      activeOrganizationId: TOrganizationId | null;
      name?: string | null;
      email?: string | null;
    };
  };
  email: string;
  roleTemplate: TRole;
  expiresInDays?: number;
  existingInvitations: Array<{
    email: string;
    status: OrganizationInvitationStatus;
  }>;
  appOrigin?: string | null;
  createToken?: () => string;
  hashToken?: (token: string) => Promise<string>;
  now?: number;
  insertInvitation: (input: {
    organizationId: TOrganizationId;
    email: string;
    tokenHash: string;
    roleTemplate: TRole;
    status: "pending";
    invitedBy: TUserId;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
  }) => Promise<TInvitationId>;
  writeAudit: (input: {
    organizationId: TOrganizationId;
    userId: TUserId;
    userName?: string | null;
    userEmail?: string | null;
    action: "member.invited";
    resourceId: TInvitationId;
    resourceType: "organization_invitation";
    targetUserEmail: string;
    description: string;
    newValue: TRole;
  }) => Promise<void>;
};

export async function createOrganizationInvitation<
  TOrganizationId extends string,
  TUserId extends string,
  TInvitationId extends string,
  TRole extends string = OrganizationRoleTemplate,
>(
  args: CreateOrganizationInvitationArgs<TOrganizationId, TUserId, TInvitationId, TRole>,
): Promise<CreateOrganizationInvitationResult<TInvitationId>> {
  assertOrganizationScope({
    activeOrganizationId: args.viewer.user.activeOrganizationId,
    authorizedOrganizationId: args.authorizedOrganizationId,
    requestedOrganizationId: args.organizationId,
  });

  const normalizedEmail = normalizeInvitationEmail(args.email);
  const emailValidationError = getInvitationEmailValidationError(normalizedEmail);
  if (emailValidationError !== null) {
    throw new OrganizationInvitationPolicyError({
      code: "INVALID_ARGUMENT",
      message: emailValidationError,
    });
  }

  if (
    hasDuplicatePendingInvitation({
      invitations: args.existingInvitations,
      email: normalizedEmail,
    })
  ) {
    throw new OrganizationInvitationPolicyError({
      code: "ALREADY_EXISTS",
      message: "Pending invitation already exists for that email",
    });
  }

  const now = args.now ?? Date.now();
  const token = args.createToken?.() ?? crypto.randomUUID();
  const tokenHash = await (args.hashToken ?? sha256)(token);
  const expiresAt = computeInvitationExpiresAt({
    now,
    expiresInDays: args.expiresInDays,
  });

  const invitationId = await args.insertInvitation({
    organizationId: args.organizationId,
    email: normalizedEmail,
    tokenHash,
    roleTemplate: args.roleTemplate,
    status: "pending",
    invitedBy: args.viewer.user._id,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  await args.writeAudit({
    organizationId: args.organizationId,
    userId: args.viewer.user._id,
    userName: args.viewer.user.name,
    userEmail: args.viewer.user.email,
    action: "member.invited",
    resourceId: invitationId,
    resourceType: "organization_invitation",
    targetUserEmail: normalizedEmail,
    description: `Invited ${normalizedEmail} to organization`,
    newValue: args.roleTemplate,
  });

  return {
    ok: true,
    invitationId,
    token,
    acceptUrl:
      buildInvitationAcceptUrl({
        token,
        appOrigin: args.appOrigin ?? null,
      }) ?? `/accept-invite?token=${encodeURIComponent(token)}`,
  };
}

export type RedeemOrganizationInvitationResult<TOrganizationId extends string> = {
  ok: true;
  organizationId: TOrganizationId;
};

export type RedeemOrganizationInvitationRecord<
  TOrganizationId extends string,
  TUserId extends string,
  TInvitationId extends string,
  TRole extends string = OrganizationRoleTemplate,
> = {
  _id: TInvitationId;
  organizationId: TOrganizationId;
  email: string;
  status: OrganizationInvitationStatus;
  roleTemplate: TRole;
  invitedBy: TUserId;
  expiresAt: number;
};

export type RedeemOrganizationInvitationArgs<
  TOrganizationId extends string,
  TUserId extends string,
  TInvitationId extends string,
  TMembershipId extends string,
  TRole extends string = OrganizationRoleTemplate,
> = {
  token: string;
  currentUser: {
    _id: TUserId;
    email: string;
    name?: string | null;
  } | null;
  hashToken?: (token: string) => Promise<string>;
  now?: number;
  findInvitationByTokenHash: (
    tokenHash: string,
  ) => Promise<RedeemOrganizationInvitationRecord<
    TOrganizationId,
    TUserId,
    TInvitationId,
    TRole
  > | null>;
  findExistingMembership: (input: {
    userId: TUserId;
    organizationId: TOrganizationId;
  }) => Promise<{ _id: TMembershipId } | null>;
  patchExistingMembership: (
    membershipId: TMembershipId,
    patch: {
      roleTemplate: TRole;
      status: "active";
      invitedBy: TUserId;
      assignedBy: TUserId;
      updatedAt: number;
    },
  ) => Promise<void>;
  insertMembership: (input: {
    organizationId: TOrganizationId;
    userId: TUserId;
    roleTemplate: TRole;
    status: "active";
    invitedBy: TUserId;
    assignedBy: TUserId;
    joinedAt: number;
    createdAt: number;
    updatedAt: number;
  }) => Promise<TMembershipId>;
  markInvitationExpired: (invitationId: TInvitationId, now: number) => Promise<void>;
  markInvitationAccepted: (
    invitationId: TInvitationId,
    patch: {
      status: "accepted";
      acceptedByUserId: TUserId;
      acceptedAt: number;
      updatedAt: number;
    },
  ) => Promise<void>;
  setActiveOrganization: (
    userId: TUserId,
    organizationId: TOrganizationId,
    now: number,
  ) => Promise<void>;
  writeAudit: (input: {
    organizationId: TOrganizationId;
    userId: TUserId;
    userName?: string | null;
    userEmail: string;
    action: "member.invited";
    resourceId: TInvitationId;
    resourceType: "organization_invitation";
    targetUserId: TUserId;
    targetUserEmail: string;
    description: "Accepted organization invitation";
    newValue: TRole;
  }) => Promise<void>;
};

export async function redeemOrganizationInvitation<
  TOrganizationId extends string,
  TUserId extends string,
  TInvitationId extends string,
  TMembershipId extends string,
  TRole extends string = OrganizationRoleTemplate,
>(
  args: RedeemOrganizationInvitationArgs<
    TOrganizationId,
    TUserId,
    TInvitationId,
    TMembershipId,
    TRole
  >,
): Promise<RedeemOrganizationInvitationResult<TOrganizationId>> {
  if (args.currentUser === null) {
    throw new OrganizationInvitationPolicyError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  const email = normalizeInvitationEmail(args.currentUser.email);
  if (email.length === 0) {
    throw new OrganizationInvitationPolicyError({
      code: "FORBIDDEN",
      message: "User email required",
    });
  }

  const tokenHash = await (args.hashToken ?? sha256)(args.token);
  const invitation = await args.findInvitationByTokenHash(tokenHash);
  if (invitation === null) {
    throw new OrganizationInvitationPolicyError({
      code: "NOT_FOUND",
      message: "Invitation not found",
    });
  }

  const now = args.now ?? Date.now();
  if (invitation.status !== "pending") {
    throw new OrganizationInvitationPolicyError({
      code: "FORBIDDEN",
      message: "Invitation no longer valid",
    });
  }
  if (invitation.expiresAt <= now) {
    await args.markInvitationExpired(invitation._id, now);
    throw new OrganizationInvitationPolicyError({
      code: "FORBIDDEN",
      message: "Invitation expired",
    });
  }
  if (invitation.email !== email) {
    throw new OrganizationInvitationPolicyError({
      code: "FORBIDDEN",
      message: "Invitation email mismatch",
    });
  }

  await activateRedeemedInvitationMembership(args, invitation, args.currentUser._id, now);

  await args.markInvitationAccepted(invitation._id, {
    status: "accepted",
    acceptedByUserId: args.currentUser._id,
    acceptedAt: now,
    updatedAt: now,
  });

  await args.setActiveOrganization(args.currentUser._id, invitation.organizationId, now);

  await args.writeAudit({
    organizationId: invitation.organizationId,
    userId: args.currentUser._id,
    userName: args.currentUser.name,
    userEmail: args.currentUser.email,
    action: "member.invited",
    resourceId: invitation._id,
    resourceType: "organization_invitation",
    targetUserId: args.currentUser._id,
    targetUserEmail: args.currentUser.email,
    description: "Accepted organization invitation",
    newValue: invitation.roleTemplate,
  });

  return {
    ok: true,
    organizationId: invitation.organizationId,
  };
}

async function activateRedeemedInvitationMembership<
  TOrganizationId extends string,
  TUserId extends string,
  TInvitationId extends string,
  TMembershipId extends string,
  TRole extends string = OrganizationRoleTemplate,
>(
  args: RedeemOrganizationInvitationArgs<
    TOrganizationId,
    TUserId,
    TInvitationId,
    TMembershipId,
    TRole
  >,
  invitation: RedeemOrganizationInvitationRecord<TOrganizationId, TUserId, TInvitationId, TRole>,
  userId: TUserId,
  now: number,
): Promise<void> {
  const existingMembership = await args.findExistingMembership({
    userId,
    organizationId: invitation.organizationId,
  });

  if (existingMembership) {
    await args.patchExistingMembership(existingMembership._id, {
      roleTemplate: invitation.roleTemplate,
      status: "active",
      invitedBy: invitation.invitedBy,
      assignedBy: invitation.invitedBy,
      updatedAt: now,
    });
    return;
  }

  await args.insertMembership({
    organizationId: invitation.organizationId,
    userId,
    roleTemplate: invitation.roleTemplate,
    status: "active",
    invitedBy: invitation.invitedBy,
    assignedBy: invitation.invitedBy,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export async function setOrganizationMemberRole<
  TOrganizationId extends string,
  TUserId extends string,
  TMembershipId extends string,
>(args: {
  membershipId: TMembershipId;
  roleTemplate: OrganizationRoleTemplate;
  membership: {
    _id: TMembershipId;
    organizationId: TOrganizationId;
    userId: TUserId;
    roleTemplate: OrganizationRoleTemplate;
  } | null;
  authorizedOrganizationId: TOrganizationId;
  viewer: {
    user: {
      _id: TUserId;
      name?: string | null;
      email?: string | null;
    };
  };
  patchMembership: (
    membershipId: TMembershipId,
    patch: { roleTemplate: OrganizationRoleTemplate; updatedAt: number },
  ) => Promise<void>;
  writeAudit: (input: {
    organizationId: TOrganizationId;
    userId: TUserId;
    userName?: string | null;
    userEmail?: string | null;
    action: "member.role_changed";
    resourceId: TMembershipId;
    resourceType: "organization_member";
    targetUserId: TUserId;
    description: "Changed organization member role";
    oldValue: OrganizationRoleTemplate;
    newValue: OrganizationRoleTemplate;
  }) => Promise<void>;
  now?: number;
}): Promise<{ ok: true }> {
  if (!args.membership || args.membership.organizationId !== args.authorizedOrganizationId) {
    throw new OrganizationInvitationPolicyError({
      code: "NOT_FOUND",
      message: "Membership not found",
    });
  }

  const now = args.now ?? Date.now();
  await args.patchMembership(args.membershipId, {
    roleTemplate: args.roleTemplate,
    updatedAt: now,
  });

  await args.writeAudit({
    organizationId: args.authorizedOrganizationId,
    userId: args.viewer.user._id,
    userName: args.viewer.user.name,
    userEmail: args.viewer.user.email,
    action: "member.role_changed",
    resourceId: args.membershipId,
    resourceType: "organization_member",
    targetUserId: args.membership.userId,
    description: "Changed organization member role",
    oldValue: args.membership.roleTemplate,
    newValue: args.roleTemplate,
  });

  return { ok: true };
}

export async function setOrganizationMemberStatus<
  TOrganizationId extends string,
  TUserId extends string,
  TMembershipId extends string,
>(args: {
  membershipId: TMembershipId;
  status: OrganizationMemberLifecycleStatus;
  membership: {
    _id: TMembershipId;
    organizationId: TOrganizationId;
    userId: TUserId;
    roleTemplate: OrganizationRoleTemplate;
    status: OrganizationMemberPolicyStatus;
  } | null;
  activeMemberships: Array<{
    roleTemplate: OrganizationRoleTemplate;
    status: OrganizationMemberPolicyStatus;
  }>;
  authorizedOrganizationId: TOrganizationId;
  viewer: {
    user: {
      _id: TUserId;
      name?: string | null;
      email?: string | null;
    };
  };
  patchMembership: (
    membershipId: TMembershipId,
    patch: { status: OrganizationMemberLifecycleStatus; updatedAt: number },
  ) => Promise<void>;
  writeAudit: (input: {
    organizationId: TOrganizationId;
    userId: TUserId;
    userName?: string | null;
    userEmail?: string | null;
    action: "member.reactivated" | "member.suspended";
    resourceId: TMembershipId;
    resourceType: "organization_member";
    targetUserId: TUserId;
    description: "Reactivated organization member" | "Suspended organization member";
    oldValue: OrganizationMemberPolicyStatus;
    newValue: OrganizationMemberLifecycleStatus;
  }) => Promise<void>;
  now?: number;
  ownerRoleTemplate?: OrganizationRoleTemplate;
}): Promise<{ ok: true }> {
  if (!args.membership || args.membership.organizationId !== args.authorizedOrganizationId) {
    throw new OrganizationInvitationPolicyError({
      code: "NOT_FOUND",
      message: "Membership not found",
    });
  }

  const ownerRoleTemplate = args.ownerRoleTemplate ?? "owner";
  if (
    wouldRemoveLastActiveOwner({
      ownerRoleId: ownerRoleTemplate,
      membershipRoleId: args.membership.roleTemplate,
      membershipStatus: args.membership.status,
      nextRoleId: args.membership.roleTemplate,
      nextStatus: args.status,
      activeMemberships: args.activeMemberships.map((membership) => ({
        roleId: membership.roleTemplate,
        status: membership.status,
      })),
    })
  ) {
    throw new OrganizationInvitationPolicyError({
      code: "FAILED_PRECONDITION",
      message: "Cannot remove the last active owner from an organization",
    });
  }

  if (args.membership.status === args.status) {
    return { ok: true };
  }

  const now = args.now ?? Date.now();
  await args.patchMembership(args.membershipId, {
    status: args.status,
    updatedAt: now,
  });

  await args.writeAudit({
    organizationId: args.authorizedOrganizationId,
    userId: args.viewer.user._id,
    userName: args.viewer.user.name,
    userEmail: args.viewer.user.email,
    action: args.status === "active" ? "member.reactivated" : "member.suspended",
    resourceId: args.membershipId,
    resourceType: "organization_member",
    targetUserId: args.membership.userId,
    description:
      args.status === "active"
        ? "Reactivated organization member"
        : "Suspended organization member",
    oldValue: args.membership.status,
    newValue: args.status,
  });

  return { ok: true };
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
