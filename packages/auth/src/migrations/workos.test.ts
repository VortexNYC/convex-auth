/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { normalizeWorkosExport } from "./workos.js";
import type { WorkosMembership, WorkosOrganization, WorkosUser } from "./workos.js";
import fixture from "./fixtures/workos-export.json";

type Fixture = {
  users: WorkosUser[];
  organizations: WorkosOrganization[];
  memberships: WorkosMembership[];
};

const data = fixture as Fixture;

describe("normalizeWorkosExport", () => {
  const out = normalizeWorkosExport(data);

  it("imports users with ISO timestamps converted to ms", () => {
    const margaret = out.users.find((u) => u.email === "margaret@example.com");
    expect(margaret).toMatchObject({
      externalId: "user_01E4ZCR3C56J083X43JQXF3JK5",
      name: "Margaret Hamilton",
      emailVerified: true,
      image: "https://cdn.workos.com/margaret.png",
      createdAt: Date.parse("2024-01-15T10:30:00.000Z"),
    });
  });

  it("carries bcrypt digests from a support export", () => {
    const cred = out.accounts.find((a) => a.userEmail === "margaret@example.com");
    expect(cred).toMatchObject({
      provider: "password",
      issuer: "native",
      passwordHash: "$2b$10$AnPv4/qb1oLaM7t/RGRXJuPFAO3j5YjhpIeWIlu7yZ5dDEoEtH6CO",
    });
  });

  it("skips hashers we cannot verify so those users reset instead", () => {
    expect(out.accounts.find((a) => a.userEmail === "katherine@example.com")).toBeUndefined();
    expect(
      out.skipped.find(
        (s) => s.kind === "credential" && s.externalId === "user_01E4ZCR3C6TF9V9P8XJJ2ZZZZZ",
      )?.reason,
    ).toContain("ssha256");
  });

  it("derives slugs for WorkOS orgs and reports collisions", () => {
    expect(out.organizations.map((o) => o.slug)).toEqual(["wayne-enterprises", "stark-industries"]);
    expect(
      out.skipped.find(
        (s) => s.kind === "organization" && s.externalId === "org_01EHZNVPK3DUPLICATE-SLUG",
      )?.reason,
    ).toContain("collides");
  });

  it("resolves memberships through external ids and both role shapes", () => {
    expect(out.memberships).toHaveLength(3);
    const admin = out.memberships.find((m) => m.userEmail === "margaret@example.com");
    expect(admin).toMatchObject({ organizationSlug: "wayne-enterprises", roleKey: "admin" });
    const member = out.memberships.find(
      (m) => m.userEmail === "dorothy@example.com" && m.status === "active",
    );
    expect(member?.roleKey).toBe("member");
  });

  it("keeps pending memberships invited and skips non-importable states", () => {
    const pending = out.memberships.find((m) => m.userEmail === "katherine@example.com");
    expect(pending).toBeDefined();
    expect(
      out.skipped.find((s) => s.kind === "membership" && s.externalId === "om_01EHZNVPKN3REMOVED")
        ?.reason,
    ).toContain("not importable");
  });

  it("skips memberships that reference rows outside the export", () => {
    expect(
      out.skipped.find((s) => s.kind === "membership" && s.externalId === "om_01EHZNVPKN1DANGLING")
        ?.reason,
    ).toContain("not in export");
  });

  it("drops users with no email", () => {
    const withBad = normalizeWorkosExport({
      users: [...data.users, { id: "user_bad", email: "" } as WorkosUser],
    });
    expect(withBad.skipped.find((s) => s.externalId === "user_bad")?.reason).toContain("email");
  });
});
