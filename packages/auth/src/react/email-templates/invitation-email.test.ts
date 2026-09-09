/**
 * Coverage for `renderAuthInvitationEmail` + `ConvexInvitationEmailTemplate`.
 *
 * The invitation transactional email is the Convex-owned surface
 * the package renders for every B2B onboarding flow. Until now it had
 * zero direct test coverage. Rendering flows through convex-auth,
 * which returns real HTML + plaintext.
 *
 * Contract:
 *   1. subject reflects the organization name
 *   2. HTML body contains the inviter label, org name, role name
 *   3. accept URL is rendered as a clickable anchor
 *   4. expiry date is rendered as a UTC string
 *   5. plaintext variant contains the same key fields and fallback copy
 *   6. from + to pass-through unchanged
 */
import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { renderAuthInvitationEmail } from "./invitation-email-render";

const baseArgs = {
  from: "no-reply@example.com",
  to: "invitee@example.com",
  organizationName: "Acme Pizza",
  roleName: "admin",
  inviterLabel: "Shlomo (shlomo@example.com)",
  acceptUrl: "https://app.example.com/invite/accept?token=abc123",
  expiresAt: Date.UTC(2026, 5, 30, 12, 0, 0), // 2026-06-30 12:00 UTC
};

describe("renderAuthInvitationEmail", () => {
  it("subject reflects the organization name", async () => {
    const draft = await renderAuthInvitationEmail(baseArgs);
    assert.equal(draft.subject, "You're invited to Acme Pizza");
  });

  it("HTML contains the inviter label, org name, and role name", async () => {
    const { html } = await renderAuthInvitationEmail(baseArgs);
    assert.ok(html.includes("Acme Pizza"), "missing organizationName");
    assert.ok(html.includes("admin"), "missing roleName");
    assert.ok(html.includes("Shlomo (shlomo@example.com)"), "missing inviterLabel");
  });

  it("HTML renders the accept URL", async () => {
    const { html } = await renderAuthInvitationEmail(baseArgs);
    assert.ok(
      html.includes("https://app.example.com/invite/accept?token=abc123"),
      "missing acceptUrl",
    );
  });

  it("HTML renders the expiry as a UTC string", async () => {
    const { html } = await renderAuthInvitationEmail(baseArgs);
    // toUTCString format includes the year and "GMT".
    assert.ok(/2026/.test(html), "missing expiry year");
    assert.ok(/GMT/.test(html), "missing GMT marker");
  });

  it("plaintext variant is non-empty and contains the org name", async () => {
    const { text } = await renderAuthInvitationEmail(baseArgs);
    assert.ok(text.length > 0, "plaintext is empty");
    assert.ok(text.includes("Acme Pizza"), "plaintext missing organizationName");
    assert.ok(text.includes(baseArgs.acceptUrl), "plaintext missing acceptUrl");
    assert.ok(
      text.includes("If you are not expecting this invitation, please ignore this email."),
      "plaintext missing ignore copy",
    );
  });

  it("from + to pass through unchanged", async () => {
    const draft = await renderAuthInvitationEmail(baseArgs);
    assert.equal(draft.from, "no-reply@example.com");
    assert.equal(draft.to, "invitee@example.com");
  });
});
