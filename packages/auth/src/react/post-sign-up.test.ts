import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  clearPendingPostSignUpSync,
  getPostSignUpStatusDescription,
  getSelectableOrganizationCount,
  markPendingPostSignUpSync,
  shouldAttemptEnsureOrganization,
  shouldSchedulePostSignUpTimeout,
  type PostSignUpStorageLike,
} from "./post-sign-up";

function createStorage(): PostSignUpStorageLike & {
  getItem(key: string): string | null;
} {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("post sign-up helpers", () => {
  it("counts selectable organizations only", () => {
    assert.equal(
      getSelectableOrganizationCount([
        { canSelect: true },
        { canSelect: false },
        { canSelect: true },
      ]),
      2,
    );
    assert.equal(getSelectableOrganizationCount(undefined), 0);
  });

  it("attempts ensure when org is absent, orgs resolved, and not attempted", () => {
    assert.equal(
      shouldAttemptEnsureOrganization({
        hasCurrentOrganization: false,
        availableOrganizationsResolved: true,
        selectableOrganizationCount: 1,
        hasAttemptedEnsure: false,
      }),
      true,
    );
    assert.equal(
      shouldAttemptEnsureOrganization({
        hasCurrentOrganization: true,
        availableOrganizationsResolved: true,
        selectableOrganizationCount: 1,
        hasAttemptedEnsure: false,
      }),
      false,
    );
    assert.equal(
      shouldAttemptEnsureOrganization({
        hasCurrentOrganization: false,
        availableOrganizationsResolved: false,
        selectableOrganizationCount: 1,
        hasAttemptedEnsure: false,
      }),
      false,
    );
    assert.equal(
      shouldAttemptEnsureOrganization({
        hasCurrentOrganization: false,
        availableOrganizationsResolved: true,
        selectableOrganizationCount: 0,
        hasAttemptedEnsure: false,
      }),
      true,
    );
    assert.equal(
      shouldAttemptEnsureOrganization({
        hasCurrentOrganization: false,
        availableOrganizationsResolved: true,
        selectableOrganizationCount: 1,
        hasAttemptedEnsure: true,
      }),
      false,
    );
  });

  it("schedules timeout only while organization is still missing", () => {
    assert.equal(shouldSchedulePostSignUpTimeout(false), true);
    assert.equal(shouldSchedulePostSignUpTimeout(true), false);
  });

  it("returns correct status description", () => {
    assert.equal(getPostSignUpStatusDescription(true), "Activating your organization now...");
    assert.equal(
      getPostSignUpStatusDescription(false),
      "We're waiting for your organization access to finish syncing.",
    );
  });

  it("marks and clears pending sync storage keys", () => {
    const storage = createStorage();
    markPendingPostSignUpSync({ storage, pendingKey: "pending" });
    assert.equal(storage.getItem("pending"), "true");

    storage.setItem("failure", "invite-email-mismatch");
    clearPendingPostSignUpSync({
      storage,
      pendingKey: "pending",
      failureKey: "failure",
    });
    assert.equal(storage.getItem("pending"), null);
    assert.equal(storage.getItem("failure"), null);
  });
});
