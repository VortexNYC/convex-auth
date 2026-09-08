/**
 * Unit coverage for suite org security metadata helpers (VOR-183).
 */
import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  mergeOrganizationSecurityIntoMetadataJson,
  parseOrganizationSecurityFromMetadataJson,
  ORGANIZATION_SECURITY_METADATA_KEY,
} from "./organization-security";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("organization security metadata (VOR-183)", () => {
  it("returns undefined for empty / invalid metadata", () => {
    assert.equal(parseOrganizationSecurityFromMetadataJson(undefined), undefined);
    assert.equal(parseOrganizationSecurityFromMetadataJson(""), undefined);
    assert.equal(parseOrganizationSecurityFromMetadataJson("{"), undefined);
  });

  it("parses security fields from metadataJson", () => {
    const security = parseOrganizationSecurityFromMetadataJson(
      JSON.stringify({
        [ORGANIZATION_SECURITY_METADATA_KEY]: {
          requireMfa: true,
          sessionTimeoutMinutes: 120,
          ignored: true,
        },
        other: 1,
      }),
    );
    assert.deepEqual(security, {
      requireMfa: true,
      sessionTimeoutMinutes: 120,
    });
  });

  it("rejects out-of-range sessionTimeoutMinutes on parse", () => {
    const security = parseOrganizationSecurityFromMetadataJson(
      JSON.stringify({
        [ORGANIZATION_SECURITY_METADATA_KEY]: {
          requireMfa: false,
          sessionTimeoutMinutes: 5,
        },
      }),
    );
    assert.deepEqual(security, { requireMfa: false });
  });

  it("merges security updates and preserves sibling metadata keys", () => {
    const next = mergeOrganizationSecurityIntoMetadataJson(JSON.stringify({ keep: true }), {
      requireMfa: true,
      sessionTimeoutMinutes: 480,
    });
    assert.ok(next);
    const parsed: unknown = JSON.parse(next);
    assert.ok(isRecord(parsed));
    assert.equal(parsed.keep, true);
    assert.deepEqual(parsed[ORGANIZATION_SECURITY_METADATA_KEY], {
      requireMfa: true,
      sessionTimeoutMinutes: 480,
    });
  });

  it("throws on invalid sessionTimeoutMinutes during merge", () => {
    assert.throws(
      () =>
        mergeOrganizationSecurityIntoMetadataJson(undefined, {
          sessionTimeoutMinutes: 10,
        }),
      /sessionTimeoutMinutes must be between/,
    );
  });

  it("clears security fields with null and drops empty security object", () => {
    const seeded = mergeOrganizationSecurityIntoMetadataJson(undefined, {
      requireMfa: true,
      sessionTimeoutMinutes: 60,
    });
    const cleared = mergeOrganizationSecurityIntoMetadataJson(seeded, {
      requireMfa: null,
      sessionTimeoutMinutes: null,
    });
    assert.equal(cleared, undefined);
  });
});
