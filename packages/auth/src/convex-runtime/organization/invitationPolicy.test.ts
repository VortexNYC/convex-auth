import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  assertCanInviteMember,
  assertOrganizationScope,
  buildInvitationRequest,
  computeInvitationExpiresAt,
  createOrganizationInvitation,
  findInvitationEmailByToken,
  getInvitationEmailValidationError,
  hasDuplicatePendingInvitation,
  normalizeInvitationEmail,
  OrganizationInvitationPolicyError,
  redeemOrganizationInvitation,
  setOrganizationMemberRole,
  setOrganizationMemberStatus,
} from "./invitationPolicy";

describe("hasDuplicatePendingInvitation", () => {
  it("returns true for same email with pending invite", () => {
    assert.equal(
      hasDuplicatePendingInvitation({
        email: "demo@example.com",
        invitations: [
          { email: "demo@example.com", status: "pending" },
          { email: "other@example.com", status: "accepted" },
        ],
      }),
      true,
    );
  });

  it("ignores non-pending invites", () => {
    assert.equal(
      hasDuplicatePendingInvitation({
        email: "demo@example.com",
        invitations: [{ email: "demo@example.com", status: "revoked" }],
      }),
      false,
    );
  });

  it("normalizes and validates invite email once for consumers", () => {
    assert.equal(normalizeInvitationEmail(" demo@example.com "), "demo@example.com");
    assert.equal(getInvitationEmailValidationError("   "), "Email required");
    assert.equal(getInvitationEmailValidationError("demo@example.com"), null);
  });

  it("computes expiration with a one-day minimum", () => {
    assert.equal(
      computeInvitationExpiresAt({ now: 1000, expiresInDays: 0 }),
      1000 + 24 * 60 * 60 * 1000,
    );
  });
});

describe("organization invitation helpers", () => {
  it("finds an invitation email by token across organization snapshots", () => {
    assert.equal(
      findInvitationEmailByToken(
        [
          { invitations: [{ id: "skip", emailAddress: "skip@example.com" }] },
          {
            invitations: [{ id: "invite_1", emailAddress: "new@example.com" }],
          },
        ],
        "invite_1",
      ),
      "new@example.com",
    );
    assert.equal(findInvitationEmailByToken([{ invitations: [] }], "missing"), null);
  });

  it("normalizes invitation requests", () => {
    assert.deepEqual(
      buildInvitationRequest({
        organizationId: "org_1",
        email: " new@example.com ",
        roleTemplate: "manager",
      }),
      {
        organizationId: "org_1",
        email: "new@example.com",
        roleTemplate: "manager",
      },
    );
  });

  it("rejects organization scope mismatches with package errors", () => {
    assert.throws(
      () =>
        assertOrganizationScope({
          activeOrganizationId: "org_1",
          authorizedOrganizationId: "org_1",
          requestedOrganizationId: "org_2",
        }),
      (error) => error instanceof OrganizationInvitationPolicyError && error.code === "FORBIDDEN",
    );

    assert.throws(
      () =>
        assertCanInviteMember({
          activeOrganizationId: null,
          requestedOrganizationId: "org_1",
        }),
      (error) => error instanceof OrganizationInvitationPolicyError && error.code === "FORBIDDEN",
    );
  });
});

describe("createOrganizationInvitation", () => {
  it("creates an invitation through storage and audit adapters", async () => {
    const inserted: Array<{
      organizationId: string;
      email: string;
      tokenHash: string;
      roleTemplate: string;
      expiresAt: number;
    }> = [];
    const audits: Array<{ targetUserEmail: string; resourceId: string }> = [];

    const result = await createOrganizationInvitation({
      organizationId: "org_1",
      authorizedOrganizationId: "org_1",
      viewer: {
        user: {
          _id: "user_1",
          activeOrganizationId: "org_1",
          name: "Owner",
          email: "owner@example.com",
        },
      },
      email: " new@example.com ",
      roleTemplate: "member",
      expiresInDays: 2,
      existingInvitations: [],
      appOrigin: "https://app.example.com",
      createToken: () => "plain-token",
      hashToken: async (token) => `hash:${token}`,
      now: 1000,
      insertInvitation: async (input) => {
        inserted.push(input);
        return "invite_1";
      },
      writeAudit: async (input) => {
        audits.push({
          targetUserEmail: input.targetUserEmail,
          resourceId: input.resourceId,
        });
      },
    });

    assert.deepEqual(result, {
      ok: true,
      invitationId: "invite_1",
      token: "plain-token",
      acceptUrl: "https://app.example.com/accept-invite?token=plain-token",
    });
    assert.equal(inserted[0]?.email, "new@example.com");
    assert.equal(inserted[0]?.tokenHash, "hash:plain-token");
    assert.equal(inserted[0]?.expiresAt, 1000 + 2 * 24 * 60 * 60 * 1000);
    assert.deepEqual(audits, [{ targetUserEmail: "new@example.com", resourceId: "invite_1" }]);
  });

  it("rejects duplicate pending invitations before inserting", async () => {
    await assert.rejects(
      createOrganizationInvitation({
        organizationId: "org_1",
        authorizedOrganizationId: "org_1",
        viewer: {
          user: {
            _id: "user_1",
            activeOrganizationId: "org_1",
          },
        },
        email: "new@example.com",
        roleTemplate: "member",
        existingInvitations: [{ email: "new@example.com", status: "pending" }],
        insertInvitation: async () => "invite_1",
        writeAudit: async () => {},
      }),
      (error) =>
        error instanceof OrganizationInvitationPolicyError && error.code === "ALREADY_EXISTS",
    );
  });
});

describe("redeemOrganizationInvitation", () => {
  it("inserts membership, accepts invitation, activates organization, and writes audit", async () => {
    const patches: Array<{
      id: string;
      status?: string;
      acceptedByUserId?: string;
    }> = [];
    const memberships: Array<{
      organizationId: string;
      userId: string;
      roleTemplate: string;
    }> = [];
    const activeOrganizations: Array<{
      userId: string;
      organizationId: string;
    }> = [];
    const audits: Array<{ targetUserId: string; resourceId: string }> = [];

    const result = await redeemOrganizationInvitation({
      token: "plain-token",
      currentUser: {
        _id: "user_2",
        email: "new@example.com",
        name: "New User",
      },
      hashToken: async (token) => `hash:${token}`,
      now: 1000,
      findInvitationByTokenHash: async () => ({
        _id: "invite_1",
        organizationId: "org_1",
        email: "new@example.com",
        status: "pending",
        roleTemplate: "member",
        invitedBy: "user_1",
        expiresAt: 2000,
      }),
      findExistingMembership: async () => null,
      patchExistingMembership: async () => {},
      insertMembership: async (input) => {
        memberships.push(input);
        return "membership_1";
      },
      markInvitationExpired: async () => {},
      markInvitationAccepted: async (invitationId, patch) => {
        patches.push({
          id: invitationId,
          status: patch.status,
          acceptedByUserId: patch.acceptedByUserId,
        });
      },
      setActiveOrganization: async (userId, organizationId) => {
        activeOrganizations.push({ userId, organizationId });
      },
      writeAudit: async (input) => {
        audits.push({
          targetUserId: input.targetUserId,
          resourceId: input.resourceId,
        });
      },
    });

    assert.deepEqual(result, { ok: true, organizationId: "org_1" });
    assert.equal(memberships[0]?.userId, "user_2");
    assert.equal(memberships[0]?.roleTemplate, "member");
    assert.deepEqual(patches, [{ id: "invite_1", status: "accepted", acceptedByUserId: "user_2" }]);
    assert.deepEqual(activeOrganizations, [{ userId: "user_2", organizationId: "org_1" }]);
    assert.deepEqual(audits, [{ targetUserId: "user_2", resourceId: "invite_1" }]);
  });

  it("expires stale invitations before rejecting redemption", async () => {
    const expired: Array<{ invitationId: string; now: number }> = [];

    await assert.rejects(
      redeemOrganizationInvitation({
        token: "plain-token",
        currentUser: {
          _id: "user_2",
          email: "new@example.com",
        },
        hashToken: async (token) => `hash:${token}`,
        now: 3000,
        findInvitationByTokenHash: async () => ({
          _id: "invite_1",
          organizationId: "org_1",
          email: "new@example.com",
          status: "pending",
          roleTemplate: "member",
          invitedBy: "user_1",
          expiresAt: 2000,
        }),
        findExistingMembership: async () => null,
        patchExistingMembership: async () => {},
        insertMembership: async () => "membership_1",
        markInvitationExpired: async (invitationId, now) => {
          expired.push({ invitationId, now });
        },
        markInvitationAccepted: async () => {},
        setActiveOrganization: async () => {},
        writeAudit: async () => {},
      }),
      (error) => error instanceof OrganizationInvitationPolicyError && error.code === "FORBIDDEN",
    );

    assert.deepEqual(expired, [{ invitationId: "invite_1", now: 3000 }]);
  });
});

describe("setOrganizationMemberRole", () => {
  it("patches role and writes audit through adapters", async () => {
    const patches: Array<{
      id: string;
      roleTemplate: string;
      updatedAt: number;
    }> = [];
    const audits: Array<{
      targetUserId: string;
      oldValue: string;
      newValue: string;
    }> = [];

    const result = await setOrganizationMemberRole({
      membershipId: "membership_1",
      roleTemplate: "admin",
      membership: {
        _id: "membership_1",
        organizationId: "org_1",
        userId: "user_2",
        roleTemplate: "member",
      },
      authorizedOrganizationId: "org_1",
      viewer: {
        user: {
          _id: "user_1",
          name: "Owner",
          email: "owner@example.com",
        },
      },
      now: 1234,
      patchMembership: async (membershipId, patch) => {
        patches.push({ id: membershipId, ...patch });
      },
      writeAudit: async (input) => {
        audits.push({
          targetUserId: input.targetUserId,
          oldValue: input.oldValue,
          newValue: input.newValue,
        });
      },
    });

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(patches, [{ id: "membership_1", roleTemplate: "admin", updatedAt: 1234 }]);
    assert.deepEqual(audits, [{ targetUserId: "user_2", oldValue: "member", newValue: "admin" }]);
  });
});

describe("setOrganizationMemberStatus", () => {
  it("patches status and writes audit through adapters", async () => {
    const patches: Array<{ id: string; status: string; updatedAt: number }> = [];
    const audits: Array<{
      action: string;
      oldValue: string;
      newValue: string;
    }> = [];

    const result = await setOrganizationMemberStatus({
      membershipId: "membership_1",
      status: "suspended",
      membership: {
        _id: "membership_1",
        organizationId: "org_1",
        userId: "user_2",
        roleTemplate: "member",
        status: "active",
      },
      activeMemberships: [
        { roleTemplate: "owner", status: "active" },
        { roleTemplate: "member", status: "active" },
      ],
      authorizedOrganizationId: "org_1",
      viewer: {
        user: {
          _id: "user_1",
          name: "Owner",
          email: "owner@example.com",
        },
      },
      now: 1234,
      patchMembership: async (membershipId, patch) => {
        patches.push({ id: membershipId, ...patch });
      },
      writeAudit: async (input) => {
        audits.push({
          action: input.action,
          oldValue: input.oldValue,
          newValue: input.newValue,
        });
      },
    });

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(patches, [{ id: "membership_1", status: "suspended", updatedAt: 1234 }]);
    assert.deepEqual(audits, [
      { action: "member.suspended", oldValue: "active", newValue: "suspended" },
    ]);
  });

  it("does not patch or audit when status is unchanged", async () => {
    let patchCount = 0;
    let auditCount = 0;

    const result = await setOrganizationMemberStatus({
      membershipId: "membership_1",
      status: "suspended",
      membership: {
        _id: "membership_1",
        organizationId: "org_1",
        userId: "user_2",
        roleTemplate: "member",
        status: "suspended",
      },
      activeMemberships: [{ roleTemplate: "owner", status: "active" }],
      authorizedOrganizationId: "org_1",
      viewer: { user: { _id: "user_1" } },
      patchMembership: async () => {
        patchCount++;
      },
      writeAudit: async () => {
        auditCount++;
      },
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(patchCount, 0);
    assert.equal(auditCount, 0);
  });

  it("rejects suspending the last active owner", async () => {
    await assert.rejects(
      setOrganizationMemberStatus({
        membershipId: "membership_1",
        status: "suspended",
        membership: {
          _id: "membership_1",
          organizationId: "org_1",
          userId: "user_1",
          roleTemplate: "owner",
          status: "active",
        },
        activeMemberships: [{ roleTemplate: "owner", status: "active" }],
        authorizedOrganizationId: "org_1",
        viewer: { user: { _id: "user_1" } },
        patchMembership: async () => {},
        writeAudit: async () => {},
      }),
      (error) =>
        error instanceof OrganizationInvitationPolicyError && error.code === "FAILED_PRECONDITION",
    );
  });
});

describe("custom consumer role catalog (TRole generic)", () => {
  // Regression: invitations carry a roleId in the convexAuth component, so the
  // policy helper must accept a consumer's OWN role union (not just the built-in
  // template). Proves both that a custom union compiles through the generic AND
  // that the role string flows to the consumer callbacks unchanged. Role validity
  // is consumer-owned — the callback maps only catalog-backed keys to a roleId.
  type AquaRole = "owner" | "accountant" | "viewer";

  it("threads a custom role union through create + redeem unchanged", async () => {
    const inserted: Array<{ roleTemplate: AquaRole }> = [];
    const auditedRoles: AquaRole[] = [];

    const result = await createOrganizationInvitation<string, string, string, AquaRole>({
      organizationId: "org_1",
      authorizedOrganizationId: "org_1",
      viewer: {
        user: {
          _id: "user_1",
          activeOrganizationId: "org_1",
          name: "Owner",
          email: "owner@aqua.test",
        },
      },
      email: "cpa@aqua.test",
      roleTemplate: "accountant",
      existingInvitations: [],
      createToken: () => "plain-token",
      hashToken: async (token) => `hash:${token}`,
      now: 1000,
      insertInvitation: async (input) => {
        inserted.push({ roleTemplate: input.roleTemplate });
        return "invite_1";
      },
      writeAudit: async (input) => {
        auditedRoles.push(input.newValue);
      },
    });

    assert.equal(result.ok, true);
    assert.equal(inserted[0]?.roleTemplate, "accountant");
    assert.equal(auditedRoles[0], "accountant");

    const redeem = await redeemOrganizationInvitation<string, string, string, string, AquaRole>({
      token: "plain-token",
      currentUser: { _id: "user_2", email: "cpa@aqua.test", name: "CPA" },
      hashToken: async (token) => `hash:${token}`,
      now: 2000,
      findInvitationByTokenHash: async () => ({
        _id: "invite_1",
        organizationId: "org_1",
        email: "cpa@aqua.test",
        status: "pending",
        roleTemplate: "accountant",
        invitedBy: "user_1",
        expiresAt: 9_999_999,
      }),
      findExistingMembership: async () => null,
      patchExistingMembership: async () => {},
      insertMembership: async (input) => {
        assert.equal(input.roleTemplate, "accountant");
        return "member_1";
      },
      markInvitationExpired: async () => {},
      markInvitationAccepted: async () => {},
      setActiveOrganization: async () => {},
      writeAudit: async (input) => {
        assert.equal(input.newValue, "accountant");
      },
    });

    assert.equal(redeem.organizationId, "org_1");
  });
});
