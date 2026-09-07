import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildInvitationAcceptUrl,
  createOrganizationInvitationEmailDraft,
  createInvitationEmailEventPatch,
  createInvitationEmailFailedPatch,
  createInvitationEmailNotConfiguredPatch,
  createInvitationEmailQueuedPatch,
  mapResendEventToInvitationEmailDelivery,
  resolveInvitationEmailFromAddress,
  sendOrganizationInvitationEmail,
} from "./invitationEmail";

describe("organization invitation email helpers", () => {
  it("builds accept URL from template placeholder", () => {
    assert.equal(
      buildInvitationAcceptUrl({
        token: "token with spaces",
        templateUrl: "https://app.example.com/invites/{token}",
      }),
      "https://app.example.com/invites/token%20with%20spaces",
    );
  });

  it("builds accept URL from app origin", () => {
    assert.equal(
      buildInvitationAcceptUrl({
        token: "abc123",
        appOrigin: "https://app.example.com/",
      }),
      "https://app.example.com/accept-invite?token=abc123",
    );
  });

  it("returns not configured when draft is missing transport settings", async () => {
    assert.deepStrictEqual(
      await createOrganizationInvitationEmailDraft({
        from: null,
        to: "invitee@example.com",
        acceptUrl: "https://app.example.com/accept-invite?token=abc",
        organizationName: "Convex",
        roleName: "Admin",
        inviterLabel: "owner@example.com",
        expiresAt: Date.UTC(2026, 0, 1),
      }),
      { status: "not_configured", reason: "missing_from_address" },
    );

    assert.deepStrictEqual(
      await createOrganizationInvitationEmailDraft({
        from: "Convex <auth@example.com>",
        to: "invitee@example.com",
        acceptUrl: null,
        organizationName: "Convex",
        roleName: "Admin",
        inviterLabel: "owner@example.com",
        expiresAt: Date.UTC(2026, 0, 1),
      }),
      { status: "not_configured", reason: "missing_accept_url" },
    );
  });

  it("renders escaped invite email content", async () => {
    const draft = await createOrganizationInvitationEmailDraft({
      from: "Convex <auth@example.com>",
      to: "invitee@example.com",
      acceptUrl: "https://app.example.com/accept-invite?token=abc",
      organizationName: "Convex & Co",
      roleName: "Admin",
      inviterLabel: "owner@example.com",
      expiresAt: Date.UTC(2026, 0, 1),
    });

    assert.equal("subject" in draft ? draft.subject : null, "You're invited to Convex & Co");
    assert.equal("to" in draft ? draft.to : null, "invitee@example.com");
    assert.match("html" in draft ? draft.html : "", /Convex &amp; Co/);
    assert.match("text" in draft ? draft.text : "", /Convex & Co/);
    assert.match("html" in draft ? draft.html : "", /owner@example\.com/);
    assert.match("html" in draft ? draft.html : "", /Admin/);
    assert.match(
      "html" in draft ? draft.html : "",
      /https:\/\/app\.example\.com\/accept-invite\?token=abc/,
    );
  });

  it("maps Resend delivery events into invite delivery status", () => {
    assert.deepStrictEqual(
      mapResendEventToInvitationEmailDelivery({
        event: { type: "email.delivered" },
      }),
      { status: "delivered", eventType: "email.delivered" },
    );

    assert.deepStrictEqual(
      mapResendEventToInvitationEmailDelivery({
        event: {
          type: "email.bounced",
          data: { bounce: { message: "Mailbox not found" } },
        },
      }),
      {
        status: "bounced",
        eventType: "email.bounced",
        error: "Mailbox not found",
      },
    );
  });

  it("creates delivery patches for client Convex mutations", () => {
    assert.deepStrictEqual(createInvitationEmailQueuedPatch({ emailId: "email_123", now: 10 }), {
      emailId: "email_123",
      emailDeliveryStatus: "queued",
      emailDeliveryEvent: "queued",
      emailDeliveryError: undefined,
      emailDeliveryUpdatedAt: 10,
    });

    assert.deepStrictEqual(
      createInvitationEmailNotConfiguredPatch({
        reason: "missing_from_address",
        now: 20,
      }),
      {
        emailDeliveryStatus: "not_configured",
        emailDeliveryEvent: "missing_from_address",
        emailDeliveryError: undefined,
        emailDeliveryUpdatedAt: 20,
      },
    );

    assert.deepStrictEqual(createInvitationEmailFailedPatch({ reason: "boom", now: 30 }), {
      emailDeliveryStatus: "failed",
      emailDeliveryEvent: "enqueue_failed",
      emailDeliveryError: "boom",
      emailDeliveryUpdatedAt: 30,
    });

    assert.deepStrictEqual(
      createInvitationEmailEventPatch({
        event: {
          type: "email.failed",
          data: { failed: { reason: "denied" } },
        },
        now: 40,
      }),
      {
        emailDeliveryStatus: "failed",
        emailDeliveryEvent: "email.failed",
        emailDeliveryError: "denied",
        emailDeliveryUpdatedAt: 40,
      },
    );
  });

  it("resolves invite email sender from primary or fallback env values", () => {
    assert.equal(
      resolveInvitationEmailFromAddress({
        primary: " Example <app@example.com> ",
        fallback: "Fallback <fallback@example.com>",
      }),
      "Example <app@example.com>",
    );
    assert.equal(
      resolveInvitationEmailFromAddress({
        primary: " ",
        fallback: "Fallback <fallback@example.com>",
      }),
      "Fallback <fallback@example.com>",
    );
    assert.equal(
      resolveInvitationEmailFromAddress({
        primary: null,
        fallback: "Fallback <fallback@example.com>",
      }),
      "Fallback <fallback@example.com>",
    );
  });

  it("orchestrates send, render, and delivery recording", async () => {
    const events: string[] = [];
    const result = await sendOrganizationInvitationEmail({
      token: "invite-token",
      invitation: {
        email: "invitee@example.com",
        organizationName: "Convex",
        roleName: "member",
        inviterLabel: "owner@example.com",
        expiresAt: Date.UTC(2026, 0, 1),
      },
      from: "Convex <auth@example.com>",
      appOrigin: "https://app.example.com",
      renderEmailDraft: async (draft) => {
        events.push(`render:${draft.acceptUrl}`);
        return {
          from: draft.from,
          to: draft.to,
          subject: "Invite",
          html: "<p>Invite</p>",
          text: "Invite",
        };
      },
      sendEmail: async (draft) => {
        events.push(`send:${draft.to}`);
        return "email_123";
      },
      recordQueued: async (emailId) => {
        events.push(`queued:${emailId}`);
        return { status: "queued", emailId };
      },
      recordNotConfigured: async (reason) => {
        events.push(`not_configured:${reason}`);
        return { status: "not_configured", reason };
      },
      recordFailed: async (reason) => {
        events.push(`failed:${reason}`);
        return { status: "failed", reason };
      },
    });

    assert.deepStrictEqual(result, { status: "queued", emailId: "email_123" });
    assert.deepStrictEqual(events, [
      "render:https://app.example.com/accept-invite?token=invite-token",
      "send:invitee@example.com",
      "queued:email_123",
    ]);
  });

  it("records missing configuration without sending", async () => {
    const result = await sendOrganizationInvitationEmail({
      token: "invite-token",
      invitation: {
        email: "invitee@example.com",
        organizationName: "Convex",
        roleName: "member",
        inviterLabel: "owner@example.com",
        expiresAt: Date.UTC(2026, 0, 1),
      },
      from: null,
      appOrigin: "https://app.example.com",
      sendEmail: async () => {
        throw new Error("send should not run");
      },
      recordQueued: async (emailId) => ({ status: "queued", emailId }),
      recordNotConfigured: async (reason) => ({
        status: "not_configured",
        reason,
      }),
      recordFailed: async (reason) => ({ status: "failed", reason }),
    });

    assert.deepStrictEqual(result, {
      status: "not_configured",
      reason: "missing_from_address",
    });
  });
});
