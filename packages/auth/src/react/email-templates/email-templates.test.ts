import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { renderAuthInvitationEmail } from "./invitation-email-render";

describe("react email templates", () => {
  describe("ConvexInvitationEmailTemplate", () => {
    it("renders an invitation email with org, role, and accept button", async () => {
      const draft = await renderAuthInvitationEmail({
        from: "Invites <invites@example.com>",
        to: "user@example.com",
        organizationName: "Acme Corp",
        roleName: "Manager",
        inviterLabel: "Alice",
        acceptUrl: "https://example.com/accept-invite?token=abc123",
        expiresAt: Date.now() + 86_400_000,
      });

      assert.equal(draft.to, "user@example.com");
      assert.equal(draft.from, "Invites <invites@example.com>");
      assert.equal(draft.subject, "You're invited to Acme Corp");
      assert.ok(draft.html.includes("Acme Corp"), "html should contain org name");
      assert.ok(draft.html.includes("Manager"), "html should contain role");
      assert.ok(draft.html.includes("Alice"), "html should contain inviter");
      assert.ok(
        draft.html.includes("https://example.com/accept-invite?token=abc123"),
        "html should contain accept url",
      );
      assert.ok(draft.text.includes("Acme Corp"), "text should contain org name");
      assert.ok(draft.text.includes("Alice"), "text should contain inviter");
    });

    it("includes expiration in both html and text", async () => {
      const expiresAt = new Date("2025-12-31T23:59:59.000Z").getTime();
      const draft = await renderAuthInvitationEmail({
        from: "Invites <invites@example.com>",
        to: "user@example.com",
        organizationName: "Beta Inc",
        roleName: "Owner",
        inviterLabel: "Bob",
        acceptUrl: "https://example.com/accept",
        expiresAt,
      });

      const expectedUtc = new Date(expiresAt).toUTCString();
      assert.ok(draft.html.includes(expectedUtc), "html should contain expiration");
      assert.ok(draft.text.includes(expectedUtc), "text should contain expiration");
    });
  });
});
