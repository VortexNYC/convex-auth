import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  formatConvexSecurityAuditCreatedAt,
  getConvexSecurityAuditActorLabel,
  type ConvexSecurityAuditListItem,
} from "./security-audit";

describe("security audit helpers", () => {
  it("prefers actor name, user name, actor email, user email, then system label", () => {
    const baseLog = {
      _id: "audit_1",
      action: "api_key.created",
      createdAt: 1,
    } satisfies ConvexSecurityAuditListItem;

    assert.equal(
      getConvexSecurityAuditActorLabel({
        ...baseLog,
        actor: { _id: "user_1", name: "Jane", email: "jane@example.com" },
        userName: "Fallback",
      }),
      "Jane",
    );
    assert.equal(
      getConvexSecurityAuditActorLabel({
        ...baseLog,
        userName: "Fallback",
        userEmail: "fallback@example.com",
      }),
      "Fallback",
    );
    assert.equal(
      getConvexSecurityAuditActorLabel({
        ...baseLog,
        actor: { _id: "user_1", email: "jane@example.com" },
        userEmail: "fallback@example.com",
      }),
      "jane@example.com",
    );
    assert.equal(
      getConvexSecurityAuditActorLabel({
        ...baseLog,
        userEmail: "fallback@example.com",
      }),
      "fallback@example.com",
    );
    assert.equal(getConvexSecurityAuditActorLabel({}, "Package system"), "Package system");
  });

  it("formats timestamps with the host locale", () => {
    assert.equal(typeof formatConvexSecurityAuditCreatedAt(1_700_000_000_000), "string");
  });
});
