/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { normalizeClerkExport } from "./clerk.js";
import type { ClerkApiUser, ClerkCsvRow, ClerkMembership, ClerkOrganization } from "./clerk.js";
import fixture from "./fixtures/clerk-export.json";

type Fixture = {
  users: ClerkApiUser[];
  csvRows: ClerkCsvRow[];
  organizations: ClerkOrganization[];
  memberships: ClerkMembership[];
};

const data = fixture as Fixture;

describe("normalizeClerkExport", () => {
  const out = normalizeClerkExport(data);

  it("imports password users with bcrypt digests from the CSV join", () => {
    const ada = out.users.find((u) => u.externalId === "user_2a1password");
    expect(ada).toMatchObject({
      email: "ada@example.com",
      emailVerified: true,
      name: "Ada Lovelace",
      image: "https://img.clerk.com/ada.png",
    });
    const cred = out.accounts.find(
      (a) => a.userExternalId === "user_2a1password" && a.provider === "password",
    );
    expect(cred?.passwordHash).toBe("$2b$10$AnPv4/qb1oLaM7t/RGRXJuPFAO3j5YjhpIeWIlu7yZ5dDEoEtH6CO");
    expect(cred?.issuer).toBe("native");
  });

  it("maps OAuth external accounts to provider + OIDC issuer + sub", () => {
    const google = out.accounts.find(
      (a) => a.userExternalId === "user_2b2oauth" && a.provider === "google",
    );
    expect(google).toMatchObject({
      issuer: "https://accounts.google.com",
      subject: "10769150350006150715113082367",
      userEmail: "grace@example.com",
    });
    const github = out.accounts.find(
      (a) => a.userExternalId === "user_2c3both" && a.provider === "github",
    );
    expect(github?.issuer).toBe("https://github.com/login/oauth");
  });

  it("skips non-bcrypt digests so those users land on the reset path", () => {
    const alanCred = out.accounts.find(
      (a) => a.userExternalId === "user_2c3both" && a.provider === "password",
    );
    expect(alanCred).toBeUndefined();
    expect(
      out.skipped.some(
        (s) =>
          s.kind === "credential" && s.externalId === "user_2c3both" && s.reason.includes("scrypt"),
      ),
    ).toBe(true);
  });

  it("flags a password user with no CSV row for reset", () => {
    const outNoCsv = normalizeClerkExport({ users: data.users });
    const pendCred = outNoCsv.skipped.find(
      (s) => s.kind === "credential" && s.externalId === "user_2f6invite",
    );
    expect(pendCred?.reason).toContain("no CSV digest");
  });

  it("skips banned and email-less users instead of activating them", () => {
    expect(out.users.map((u) => u.externalId)).not.toContain("user_2d4banned");
    expect(out.users.map((u) => u.externalId)).not.toContain("user_2e5noemail");
    expect(out.skipped.find((s) => s.externalId === "user_2d4banned")?.reason).toContain("banned");
    expect(out.skipped.find((s) => s.externalId === "user_2e5noemail")?.reason).toContain("email");
  });

  it("notes TOTP secrets as non-migratable", () => {
    expect(
      out.skipped.find(
        (s) =>
          s.kind === "credential" && s.externalId === "user_2c3both" && s.reason.includes("TOTP"),
      ),
    ).toBeDefined();
  });

  it("normalizes orgs and strips the org: prefix from role keys", () => {
    expect(out.organizations).toHaveLength(2);
    expect(out.organizations[0]).toMatchObject({
      externalId: "org_1acme",
      name: "Acme Corp",
      slug: "acme",
    });
    const admin = out.memberships.find((m) => m.roleKey === "admin");
    expect(admin?.userEmail).toBe("ada@example.com");
    const custom = out.memberships.find((m) => m.roleKey === "billing_manager");
    expect(custom?.organizationSlug).toBe("globex");
  });

  it("joins memberships through org ids and falls back to member identifier email", () => {
    expect(out.memberships).toHaveLength(4);
    expect(
      out.skipped.find((s) => s.kind === "membership" && s.externalId === "mem_4")?.reason,
    ).toContain("not in export");
    const invited = out.memberships.find((m) => m.userEmail === "newbie@example.com");
    expect(invited).toMatchObject({ organizationSlug: "acme", roleKey: "member" });
  });

  it("does not emit memberships for skipped users or non-email identifiers", () => {
    /* mem_6 joins on user_2d4banned, which was skipped as banned — its seat
     * must not be emitted (or worse, attached to a same-email user). */
    expect(out.memberships.some((m) => m.userExternalId === "user_2d4banned")).toBe(false);
    expect(
      out.skipped.find((s) => s.kind === "membership" && s.externalId === "mem_6")?.reason,
    ).toContain("skipped during normalization");
    /* mem_7's identifier is a username, not an email — skipped rather than
     * letting a free-form field impersonate a live address. */
    expect(
      out.skipped.find((s) => s.kind === "membership" && s.externalId === "mem_7")?.reason,
    ).toContain("no resolvable email");
  });
});
